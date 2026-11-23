/* PeriPage A6 바로 인쇄(2026-11-23) — 캔버스 그림을 크롬 블루투스로 프린터에 바로 보낸다.
   명령은 공개된 A6 분석(github.com/bitrate16/peripage-python)을 따른다: 초기화 10 ff fe 01 + 0×12,
   그림 머리 1d 76 30 00 30 00 <줄 수> 00 (한 번에 255줄까지), 한 줄 48바이트(384점, 1=검정, 앞 비트가 왼쪽), 끝 줄바꿈 1b 4a <n>.
   통로: ① 저전력 블루투스(Web Bluetooth, 디벗·안드로이드 크롬) — 쓸 수 있는 특성을 스스로 찾는다
         ② 직렬(Web Serial의 블루투스 SPP, 크롬이 지원할 때만) — print(cv,{via:'serial'})로 따로 부른다(진단 페이지 «직렬로 시험»). 아이폰 브라우저는 둘 다 막혀 있다.
   한 페이지에서 한 번 고르면 연결을 붙잡아 두고 다음 영수증부터는 고르는 창 없이 찍는다. */
(function(){
  const SV=[0xff00,0xffe0,0xfff0,0xae30,0xae00,0x18f0,0xfee7,0xff80,0xffb0,
    'e7810a71-73ae-499d-8c15-faa9aef0c3f2','49535343-fe7d-4ae5-8fa9-9fafd205e455','6e400001-b5a3-f393-e0a9-e50e24dcca9e'];
  const SPP='00001101-0000-1000-8000-00805f9b34fb';
  const st={dev:null,ch:null,port:null,writer:null,size:20,busy:false};
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const RATE=0.3; // 1바이트당 ms — 보내기 속도 상한(초당 약 3KB). 11-23: 겹침의 주원인은 묶음마다 보낸 초기화였고, 너무 느리면 프린터가 쉬다 되돌려 더 겹쳤다
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
    // 초기화(10 ff fe 01…)는 맨 처음 한 번만. 묶음(255줄)마다 다시 보내면 A6이 종이를 살짝 되돌려 다음 묶음이 앞 묶음 위에 겹쳐 찍혔다(11-23 효니 «중간에 한 번 롤백»)
    parts.push(hex('10fffe01000000000000000000000000'));
    for(let y=0;y<h;y+=255){const n=Math.min(255,h-y);parts.push(Uint8Array.of(0x1d,0x76,0x30,0x00,0x30,0x00,n,0x00),data.subarray(y*48,(y+n)*48))}
    parts.push(Uint8Array.of(0x1b,0x4a,feed==null?0x60:feed));
    const all=new Uint8Array(parts.reduce((s,p)=>s+p.length,0));let o=0;for(const p of parts){all.set(p,o);o+=p.length}
    return all;
  }

  // 고르기(11-23 효니 «알 수 없는 기기만 빼도 빠르겠다»): 이름이 PPG·PeriPage·A6로 시작하는 기기만 목록에 띄운다.
  // 전에 이 페이지에서 허락한 프린터가 있으면(getDevices) 창 없이 그걸 쓴다. 이름 거르기로 안 뜨는 기종이면 all:true로 전체 목록.
  async function pick(opt){
    if(!(opt&&opt.fresh)&&navigator.bluetooth.getDevices){
      try{const ds=(await navigator.bluetooth.getDevices()).filter(d=>/^(PPG|PeriPage|A6)/i.test(d.name||''));if(ds.length)return ds[0]}catch(e){}
    }
    return navigator.bluetooth.requestDevice(opt&&opt.all?{acceptAllDevices:true,optionalServices:SV}
      :{filters:[{namePrefix:'PPG'},{namePrefix:'PeriPage'},{namePrefix:'A6'}],optionalServices:SV});
  }
  // 페이지를 닫거나 떠나면 연결을 놓는다 — 열어 둔 옛 탭이 프린터를 붙잡아 새 탭 고르기 창의 PAIR가 안 켜지던 일(11-23)
  addEventListener('pagehide',()=>{try{st.dev&&st.dev.gatt.connected&&st.dev.gatt.disconnect()}catch(e){}});
  async function bleFind(dev){
    const g=dev.gatt.connected?dev.gatt:await dev.gatt.connect();
    const found=[];
    for(const s of await g.getPrimaryServices()){let cs=[];try{cs=await s.getCharacteristics()}catch(e){}
      for(const c of cs)if(c.properties.writeWithoutResponse||c.properties.write)found.push(c)}
    if(!found.length)throw new Error('쓸 수 있는 통로를 못 찾았어요');
    // 인쇄 통로는 ff00 서비스의 ff02(11-23 효니 디벗 «통로마다 시험»에서 통로 4=ff02 그림만 나옴. 49535343-8841로는 안 나옴). 없으면 응답 없는 쓰기 통로부터
    const rank=c=>c.uuid.startsWith('0000ff02')?2:c.properties.writeWithoutResponse?1:0;
    found.sort((a,b)=>rank(b)-rank(a));
    return found[0];
  }
  async function bleWrite(bytes){
    const c=st.ch;let i=0;
    // 11-23 효니 디벗: 응답 없이 20바이트·4ms로 보내니 짧은 시험 종이는 나오고 긴 영수증은 «나오다가 맒»(프린터가 받다 놓침).
    // 그래서 응답 받는 쓰기가 되는 통로(A6 ff02는 됨)면 받았다는 답을 듣고 다음 묶음을 보낸다 — 놓치지 않는다.
    // 묶음은 120바이트(긴 쓰기). 그 크기를 못 받는 기기면 20바이트로 줄여 이어 보낸다.
    if(c.properties.write){
      let size=120;
      while(i<bytes.length){
        const part=bytes.subarray(i,i+size);
        // 속도 상한 초당 약 2KB(1바이트에 0.5ms): 응답 받는 쓰기만으로는 프린터 칩이 받기만 하고 찍는 속도를 못 따라가
        // 긴 영수증 아래쪽 줄이 버려져 겹쳐 찍혔다(11-23 효니 사진). 성공한 시험 종이(20바이트·8ms≈2.5KB/s)보다 조금 느리게.
        const t0=performance.now();
        try{await c.writeValueWithResponse(part)}catch(e){if(size>20){size=20;continue}throw e}
        i+=part.length;await sleep(Math.max(2,part.length*RATE-(performance.now()-t0)));
      }
      return;
    }
    while(i<bytes.length){ // 응답 받는 쓰기가 없는 통로: 20바이트씩 천천히(12ms)
      const part=bytes.subarray(i,i+st.size);
      await c.writeValueWithoutResponse(part);
      i+=part.length;await sleep(Math.max(12,part.length*RATE));
    }
  }
  function serialReset(){try{st.writer&&st.writer.releaseLock()}catch(e){}try{st.port&&st.port.close()}catch(e){}st.writer=null;st.port=null}
  async function connect(via){
    if(via!=='serial'){
      if(st.ch&&st.dev&&st.dev.gatt.connected)return 'ble';
      if(st.dev){try{st.ch=await bleFind(st.dev);return 'ble'}catch(e){st.dev=null;st.ch=null}} // 끊겼으면 같은 기기로 다시
    }
    if(st.writer)return 'serial';
    if(via!=='serial'&&navigator.bluetooth){ // 취소하면 여기서 끝(두 번째 창은 손가락 누름이 없어 막힌다, 검토 C). 옛 방식만 되는 기기는 진단 페이지 «직렬로 시험»
      try{
        st.dev=await pick();
        st.dev.addEventListener('gattserverdisconnected',()=>{st.ch=null});
        st.ch=await bleFind(st.dev);return 'ble';
      }catch(e){st.dev=null;st.ch=null;throw e}
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
      const how=await connect(opt&&opt.via),bytes=job(cv,opt&&opt.feed);
      if(how==='ble')await bleWrite(bytes);
      else try{for(let i=0;i<bytes.length;i+=512){await st.writer.write(bytes.subarray(i,i+512));await sleep(10)}}catch(e){serialReset();throw e} // 끊기면 다음에 다시 고르게(검토 D)
      return how;
    }finally{st.busy=false}
  }
  function info(){return st.ch?{how:'ble',name:st.dev&&st.dev.name,ch:st.ch.uuid,svc:st.ch.service.uuid,size:st.size}:st.writer?{how:'serial'}:null}
  window.A6Print={supported:!!(navigator.bluetooth||navigator.serial),get busy(){return st.busy},print,connect,info,job,pick};
})();
