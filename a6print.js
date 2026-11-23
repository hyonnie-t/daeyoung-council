/* PeriPage A6 바로 인쇄(2026-11-23) — 캔버스 그림을 크롬 블루투스로 프린터에 바로 보낸다.
   명령은 공개된 A6 분석(github.com/bitrate16/peripage-python)을 따른다: 초기화 10 ff fe 01 + 0×12,
   그림 머리 1d 76 30 00 30 00 <줄 수> 00 (한 번에 255줄까지), 한 줄 48바이트(384점, 1=검정, 앞 비트가 왼쪽), 끝 줄바꿈 1b 4a <n>.
   통로: ① 저전력 블루투스(Web Bluetooth, 디벗·안드로이드 크롬) — 쓸 수 있는 특성을 스스로 찾는다
         ② 안 되면 직렬(Web Serial의 블루투스 SPP, 크롬이 지원할 때만). 아이폰 브라우저는 둘 다 막혀 있다.
   한 페이지에서 한 번 고르면 연결을 붙잡아 두고 다음 영수증부터는 고르는 창 없이 찍는다. */
(function(){
  const SV=[0xff00,0xffe0,0xfff0,0xae30,0xae00,0x18f0,0xfee7,0xff80,0xffb0,
    'e7810a71-73ae-499d-8c15-faa9aef0c3f2','49535343-fe7d-4ae5-8fa9-9fafd205e455','6e400001-b5a3-f393-e0a9-e50e24dcca9e'];
  const SPP='00001101-0000-1000-8000-00805f9b34fb';
  const st={dev:null,ch:null,port:null,writer:null,size:180,busy:false};
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const hex=s=>Uint8Array.from(s.match(/../g).map(h=>parseInt(h,16)));

  function canvasRows(cv){ // 384점 폭으로 맞춘 뒤 흑백 비트로
    let c=cv;
    if(cv.width!==384){c=document.createElement('canvas');c.width=384;c.height=Math.round(cv.height*384/cv.width);const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,384,c.height);x.drawImage(cv,0,0,384,c.height)}
    const px=c.getContext('2d').getImageData(0,0,384,c.height).data,out=new Uint8Array(48*c.height);
    for(let y=0;y<c.height;y++)for(let x=0;x<384;x++){const i=(y*384+x)*4,a=px[i+3]/255,l=(px[i]*.299+px[i+1]*.587+px[i+2]*.114)*a+255*(1-a);if(l<128)out[y*48+(x>>3)]|=0x80>>(x&7)}
    return {h:c.height,data:out};
  }
  function job(cv,feed){
    const {h,data}=canvasRows(cv),parts=[];
    for(let y=0;y<h;y+=255){const n=Math.min(255,h-y);parts.push(hex('10fffe01000000000000000000000000'),Uint8Array.of(0x1d,0x76,0x30,0x00,0x30,0x00,n,0x00),data.subarray(y*48,(y+n)*48))}
    parts.push(Uint8Array.of(0x1b,0x4a,feed==null?0x60:feed));
    const all=new Uint8Array(parts.reduce((s,p)=>s+p.length,0));let o=0;for(const p of parts){all.set(p,o);o+=p.length}
    return all;
  }

  async function bleFind(dev){
    const g=dev.gatt.connected?dev.gatt:await dev.gatt.connect();
    const found=[];
    for(const s of await g.getPrimaryServices()){let cs=[];try{cs=await s.getCharacteristics()}catch(e){}
      for(const c of cs)if(c.properties.writeWithoutResponse||c.properties.write)found.push(c)}
    if(!found.length)throw new Error('쓸 수 있는 통로를 못 찾았어요');
    found.sort((a,b)=>(b.properties.writeWithoutResponse?1:0)-(a.properties.writeWithoutResponse?1:0)); // 응답 없는 쓰기가 빠르다
    return found[0];
  }
  async function bleWrite(bytes){
    const c=st.ch;let i=0;
    while(i<bytes.length){
      const part=bytes.subarray(i,i+st.size);
      try{c.properties.writeWithoutResponse?await c.writeValueWithoutResponse(part):await c.writeValueWithResponse(part)}
      catch(e){if(st.size>20&&e.name!=='NetworkError'){st.size=20;continue}throw e} // 한 번에 보내는 양이 너무 크면 20바이트로 줄여 다시
      i+=part.length;if(c.properties.writeWithoutResponse)await sleep(st.size>20?12:4); // 프린터 버퍼가 넘치지 않게 쉬어 가며
    }
  }
  async function connect(){
    if(st.ch&&st.dev&&st.dev.gatt.connected)return 'ble';
    if(st.writer)return 'serial';
    if(st.dev){try{st.ch=await bleFind(st.dev);return 'ble'}catch(e){st.dev=null;st.ch=null}} // 끊겼으면 같은 기기로 다시
    if(navigator.bluetooth){
      try{
        st.dev=await navigator.bluetooth.requestDevice({acceptAllDevices:true,optionalServices:SV});
        st.dev.addEventListener('gattserverdisconnected',()=>{st.ch=null});
        st.ch=await bleFind(st.dev);st.size=180;return 'ble';
      }catch(e){st.dev=null;st.ch=null;if(!navigator.serial)throw e} // 저전력 목록에 없으면(옛 방식 블루투스만 쓰는 기기) 직렬로 한 번 더
    }
    if(navigator.serial){
      const p=await navigator.serial.requestPort({allowedBluetoothServiceClassIds:[SPP],filters:[{bluetoothServiceClassId:SPP}]});
      await p.open({baudRate:115200});st.port=p;st.writer=p.writable.getWriter();return 'serial';
    }
    throw new Error('이 브라우저는 프린터에 바로 연결할 수 없어요');
  }
  async function print(cv,opt){
    if(st.busy)throw new Error('인쇄 중이에요');st.busy=true;
    try{
      const how=await connect(),bytes=job(cv,opt&&opt.feed);
      if(how==='ble')await bleWrite(bytes);
      else for(let i=0;i<bytes.length;i+=512){await st.writer.write(bytes.subarray(i,i+512));await sleep(10)}
      return how;
    }finally{st.busy=false}
  }
  function info(){return st.ch?{how:'ble',name:st.dev&&st.dev.name,ch:st.ch.uuid,svc:st.ch.service.uuid,size:st.size}:st.writer?{how:'serial'}:null}
  window.A6Print={supported:!!(navigator.bluetooth||navigator.serial),print,connect,info,job};
})();
