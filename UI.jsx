import { useState, useEffect, useRef } from 'react';

export const C = {
  o:'#E8521A',d:'#0A0908',c:'#1C1916',b:'#2A2520',
  t:'#F0EDE8',m:'#7A746E',g:'#1A9E5C',r:'#D63B2F',
  bl:'#1A5FE8',y:'#E8B21A',
};

export const s = {
  btn:{display:'flex',alignItems:'center',justifyContent:'center',gap:'8px',width:'100%',padding:'14px 16px',background:C.o,border:'none',borderRadius:'14px',color:'#fff',fontSize:'0.92rem',fontWeight:700,cursor:'pointer',fontFamily:'inherit'},
  btnSec:{background:C.c,border:`1px solid ${C.b}`,color:C.t},
  card:{background:C.c,border:`1px solid ${C.b}`,borderRadius:'16px',padding:'14px',marginBottom:'12px'},
  inp:{width:'100%',background:'rgba(255,255,255,0.05)',border:`1px solid ${C.b}`,borderRadius:'12px',padding:'11px 14px',color:C.t,fontSize:'0.9rem',fontFamily:'inherit',outline:'none',boxSizing:'border-box'},
};

export function Spinner({size=44,color=C.o}){
  return <div style={{width:size,height:size,border:`3px solid rgba(255,255,255,0.08)`,borderTopColor:color,borderRadius:'50%',animation:'spin .8s linear infinite',flexShrink:0}}/>;
}

export function Chip({label,color=C.bl,bg,border,onClick}){
  return <span onClick={onClick} style={{padding:'5px 11px',borderRadius:'100px',fontSize:'0.7rem',fontWeight:600,background:bg||'rgba(26,95,232,0.12)',color,border:`1px solid ${border||'rgba(26,95,232,0.2)'}`,cursor:onClick?'pointer':'default',display:'inline-flex',alignItems:'center',margin:'3px'}}>{label}</span>;
}

export function StepImage({query,index,emoji}){
  const [st,setSt]=useState('loading');
  const src=useRef(null);
  useEffect(()=>{
    if(!query){setSt('fallback');return;}
    const img=new Image();
    img.onload=()=>{src.current=img.src;setSt('loaded');};
    img.onerror=()=>setSt('fallback');
    img.src=`https://source.unsplash.com/800x500/?${encodeURIComponent(query)}&sig=${index}`;
    return()=>{img.onload=null;img.onerror=null;};
  },[query,index]);
  return(
    <div style={{height:185,background:'#151210',position:'relative',overflow:'hidden',display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:8}}>
      {st==='loaded'&&<img src={src.current} alt="" style={{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'cover'}}/>}
      {st==='loading'&&<><div style={{width:24,height:24,border:'2px solid rgba(255,255,255,0.1)',borderTopColor:C.o,borderRadius:'50%',animation:'spin .8s linear infinite'}}/><div style={{fontSize:'0.62rem',color:C.m}}>Loading…</div></>}
      {st==='fallback'&&<><div style={{fontSize:'3rem'}}>{emoji||'🔧'}</div><div style={{fontSize:'0.65rem',color:'rgba(255,255,255,0.3)',textAlign:'center',padding:'0 16px',lineHeight:1.4}}>{query}</div></>}
    </div>
  );
}

export function NavBar({screen,t,goto}){
  const tabs=[{id:'home',ic:'🏠',lb:t('home')},{id:'fix-now',ic:'🔧',lb:t('fixNow')},{id:'nearby',ic:'🗺️',lb:t('nearby')},{id:'parts',ic:'🔩',lb:t('parts')},{id:'emergency',ic:'🚨',lb:t('emergency')}];
  return(
    <div style={{position:'absolute',bottom:0,left:0,right:0,background:'rgba(10,9,8,0.97)',backdropFilter:'blur(20px)',WebkitBackdropFilter:'blur(20px)',borderTop:`1px solid ${C.b}`,display:'flex',padding:'8px 0 max(26px,env(safe-area-inset-bottom))',zIndex:50}}>
      {tabs.map(tb=>(
        <button key={tb.id} onClick={()=>goto(tb.id)} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:3,background:'none',border:'none',cursor:'pointer',color:screen===tb.id?C.o:C.m,fontSize:'0.6rem',fontWeight:600,padding:'4px 0',fontFamily:'inherit'}}>
          <span style={{fontSize:'1.3rem',lineHeight:1}}>{tb.ic}</span>
          <span>{tb.lb}</span>
        </button>
      ))}
    </div>
  );
}

export function BackBtn({onClick,label}){
  return <button onClick={onClick} style={{background:'none',border:'none',color:C.m,fontSize:'0.82rem',cursor:'pointer',padding:'0 0 14px 0',display:'flex',alignItems:'center',gap:6,fontFamily:'inherit'}}>← {label}</button>;
}

export function LangPicker({lang,setLang,setShowLP,LANGS,t}){
  return(
    <div onClick={()=>setShowLP(false)} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.9)',zIndex:200,display:'flex',alignItems:'flex-end'}}>
      <div onClick={e=>e.stopPropagation()} style={{background:'#151310',borderRadius:'26px 26px 0 0',width:'100%',maxHeight:'80vh',overflowY:'auto',padding:20}}>
        <div style={{fontSize:'1rem',fontWeight:800,textAlign:'center',marginBottom:16}}>{t('chooseLanguage')}</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
          {Object.entries(LANGS).map(([lc,l])=>(
            <div key={lc} onClick={()=>{setLang(lc);setShowLP(false);}} style={{background:lc===lang?'rgba(232,82,26,0.1)':C.c,border:`1px solid ${lc===lang?C.o:C.b}`,borderRadius:14,padding:12,display:'flex',alignItems:'center',gap:10,cursor:'pointer'}}>
              <span style={{fontSize:'1.4rem'}}>{l.f}</span>
              <div>
                <div style={{fontSize:'0.8rem',fontWeight:700}}>{l.n}</div>
                <div style={{fontSize:'0.65rem',color:C.m}}>{l.na}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function Screen({children,bg}){
  return <div style={{position:'absolute',inset:0,display:'flex',flexDirection:'column',background:bg||C.d,overflow:'hidden'}}>{children}</div>;
}

export function Scroll({children,pad}){
  return (
    <div style={{flex:1,overflowY:'auto',overflowX:'hidden',WebkitOverflowScrolling:'touch',
      padding:pad||'16px 20px',
      paddingBottom:'calc(110px + env(safe-area-inset-bottom, 0px))',
      boxSizing:'border-box'}}>
      {children}
    </div>
  );
}
