'use strict';
/* PDF text-layer dimension-chain evidence. Coordinates here are PDF points,
 * not construction millimetres. Never convert a label to a verified placement. */
function dimensionChains(page, grid = {}) {
  const fragments = Array.isArray(page?.fragments) ? page.fragments : [];
  const axes = new Set([...(Array.isArray(grid.axes_x)?grid.axes_x:Object.keys(grid.axes_x||{})),
    ...(Array.isArray(grid.axes_y)?grid.axes_y:Object.keys(grid.axes_y||{}))].map(String));
  const tokens = fragments.map((f,i) => ({
    index:i, text:String(f?.text??f?.str??'').trim(),
    x:Number(f?.x), y:Number(f?.y)
  })).filter(t=>t.text&&Number.isFinite(t.x)&&Number.isFinite(t.y));
  const dimension = t => /^(?:\d{2,7})(?:\s*мм)?$/iu.test(t.text) && !axes.has(t.text)
    ? Number(t.text.replace(/\s*мм$/iu,'')) : null;
  const candidates=[];
  for (const t of tokens) {
    const mm=dimension(t);
    if(mm===null||mm<10||mm>1000000)continue;
    // Only group collinear printed dimension labels. This does not prove
    // dimension-line connectivity or which structure the chain describes.
    const peers=tokens.filter(p=>p.index!==t.index&&dimension(p)!==null&&
      (Math.abs(p.y-t.y)<=3||Math.abs(p.x-t.x)<=3));
    if(!peers.length)continue;
    candidates.push({page:page?.page??null,fragmentIndex:t.index,valueMm:mm,
      xPt:t.x,yPt:t.y,neighborFragmentIds:peers.map(p=>p.index).slice(0,12),
      status:'unverified_dimension_chain'});
  }
  return candidates;
}
module.exports={dimensionChains};
