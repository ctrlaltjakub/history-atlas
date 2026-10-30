// A refresh starts at the header; ordinary links and back/forward keep their targets.
(()=>{
  const reloading=performance.getEntriesByType('navigation')[0]?.type==='reload';
  if('scrollRestoration' in history)history.scrollRestoration=reloading?'manual':'auto';
  if(!reloading)return;
  if(['#episode-map','#collection','#beyond'].includes(location.hash))history.replaceState(null,'',location.pathname+location.search);
  const reset=()=>window.scrollTo({left:0,top:0,behavior:'instant'});
  reset();
  // Browsers can restore the old offset after parsing the document, even in manual mode.
  window.addEventListener('pageshow',reset,{once:true});
})();
