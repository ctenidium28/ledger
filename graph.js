/* 知識グラフ試験版。公開版は data/graph.json、編集中の内容はこのブラウザの localStorage に保存する。 */
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const svg = $("graph-canvas"), inspector = $("graph-inspector"), status = $("graph-status");
  const STORE = "knowledge-ledger-graph-draft-v1";
  const NS = "http://www.w3.org/2000/svg";
  const DEFAULT_COLOR = "#58a6ff";
  let graph = {version: 1, nodes: [], edges: [], groups: []};
  let published = JSON.stringify(graph);
  let selected = new Set();
  let action = null;
  let edgeStart = null;
  let drag = null;
  let view = {x: 0, y: 0, w: 1200, h: 760};
  const lookup = (type, id) => graph[type + "s"].find(item => item.id === id);
  const key = (type, id) => `${type}:${id}`;
  const number = (v, fallback) => Number.isFinite(Number(v)) ? Number(v) : fallback;
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const safeColor = (c, fallback = DEFAULT_COLOR) => /^#[0-9a-f]{6}$/i.test(c || "") ? c : fallback;
  const uid = () => `g-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  const escapeHtml = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function normalize(raw) {
    if (!raw || typeof raw !== "object") throw new Error("JSONの形式が正しくありません");
    const nodes = Array.isArray(raw.nodes) ? raw.nodes.slice(0, 2000).map(n => ({
      id: String(n.id), label: String(n.label ?? "ノード").slice(0, 150), description: String(n.description ?? "").slice(0, 3000),
      x: clamp(number(n.x, 100), -100000, 100000), y: clamp(number(n.y, 100), -100000, 100000),
      size: clamp(number(n.size, 150), 80, 300), color: safeColor(n.color)
    })) : [];
    const ids = new Set(nodes.map(n => n.id));
    if (ids.size !== nodes.length) throw new Error("ノードIDが重複しています");
    const edges = Array.isArray(raw.edges) ? raw.edges.slice(0, 4000).filter(e => ids.has(String(e.from)) && ids.has(String(e.to))).map(e => ({
      id: String(e.id), from: String(e.from), to: String(e.to),
      type: ["undirected", "directed", "bidirectional"].includes(e.type) ? e.type : "undirected",
      label: String(e.label ?? "").slice(0, 150),
      waypoints: Array.isArray(e.waypoints) ? e.waypoints.slice(0, 30).map(p => ({x: clamp(number(p.x,0),-100000,100000), y:clamp(number(p.y,0),-100000,100000)})) : []
    })) : [];
    const groups = Array.isArray(raw.groups) ? raw.groups.slice(0, 500).map(g => ({
      id: String(g.id), name: String(g.name ?? "グループ").slice(0, 150), color: safeColor(g.color, "#8b5cf6"),
      nodeIds: Array.isArray(g.nodeIds) ? [...new Set(g.nodeIds.map(String).filter(id => ids.has(id)))] : []
    })).filter(g => g.nodeIds.length > 0) : [];
    if (new Set(edges.map(e=>e.id)).size !== edges.length || new Set(groups.map(g=>g.id)).size !== groups.length) throw new Error("IDが重複しています");
    return {version:1, nodes, edges, groups};
  }

  const nodeHeight = () => 58;
  function groupRect(group) {
    const nodes = group.nodeIds.map(id => lookup("node", id)).filter(Boolean);
    if (!nodes.length) return null;
    return {x: Math.min(...nodes.map(n=>n.x-n.size/2))-28,
      y: Math.min(...nodes.map(n=>n.y-nodeHeight()/2))-44,
      right: Math.max(...nodes.map(n=>n.x+n.size/2))+28,
      bottom: Math.max(...nodes.map(n=>n.y+nodeHeight()/2))+28};
  }
  function svgElement(tag, props = {}, parent = svg) {
    const el = document.createElementNS(NS, tag);
    for (const [k,v] of Object.entries(props)) el.setAttribute(k, String(v));
    parent.append(el);return el;
  }
  function edgePoint(node, next) {
    const dx = next.x-node.x, dy = next.y-node.y;
    if (!dx && !dy) return {x:node.x,y:node.y};
    const t = Math.min((node.size/2)/(Math.abs(dx)||1e-9), (nodeHeight()/2)/(Math.abs(dy)||1e-9));
    return {x:node.x+dx*t,y:node.y+dy*t};
  }
  function route(edge) {
    const a=lookup("node",edge.from),b=lookup("node",edge.to);
    if (!a||!b)return [];
    if (a.id===b.id && edge.waypoints.length===0) return [
      {x:a.x+a.size/2,y:a.y},{x:a.x+a.size/2+60,y:a.y-110},
      {x:a.x-a.size/2-60,y:a.y-110},{x:a.x-a.size/2,y:a.y}
    ];
    const via=edge.waypoints;
    return [edgePoint(a,via[0]||b),...via,edgePoint(b,via[via.length-1]||a)];
  }
  function middle(points) {
    let lengths=[],total=0;
    for(let i=1;i<points.length;i++) {let d=Math.hypot(points[i].x-points[i-1].x,points[i].y-points[i-1].y);lengths.push(d);total+=d;}
    let n=total/2;
    for(let i=0;i<lengths.length;i++) if((n-=lengths[i])<=0){let t=(n+lengths[i])/(lengths[i]||1);return{x:points[i].x+(points[i+1].x-points[i].x)*t,y:points[i].y+(points[i+1].y-points[i].y)*t};}
    return points[0]||{x:0,y:0};
  }
  function draw() {
    svg.replaceChildren();
    svg.setAttribute("viewBox", `${view.x} ${view.y} ${view.w} ${view.h}`);
    const defs=svgElement("defs");
    for(const [id,reverse] of [["graph-arrow",false],["graph-arrow-reverse",true]]) {
      const marker=svgElement("marker",{id,viewBox:"0 0 10 10",refX:reverse?1:9,refY:5,markerWidth:7,markerHeight:7,orient:"auto-start-reverse"},defs);
      svgElement("path",{d:"M 0 0 L 10 5 L 0 10 Z",fill:"#9ab1c5"},marker);
    }
    svgElement("rect",{x:view.x,y:view.y,width:view.w,height:view.h,fill:"transparent","data-kind":"background"});
    for(const g of graph.groups){const r=groupRect(g);if(!r)continue;
      const grp=svgElement("g",{"data-kind":"group","data-id":g.id,class:`graph-group ${selected.has(key("group",g.id))?"selected":""}`});
      svgElement("rect",{x:r.x,y:r.y,width:r.right-r.x,height:r.bottom-r.y,rx:20,fill:g.color,"fill-opacity":0.13,stroke:g.color,"stroke-width":2,"stroke-dasharray":"9 5"},grp);
      const t=svgElement("text",{x:r.x+14,y:r.y+23,class:"graph-group-title"},grp);t.textContent=g.name;
    }
    for(const e of graph.edges){const points=route(e);if(!points.length)continue;
      const d=points.map((p,i)=>`${i?'L':'M'}${p.x},${p.y}`).join(" ");
      const grp=svgElement("g",{"data-kind":"edge","data-id":e.id,class:`graph-edge ${selected.has(key("edge",e.id))?"selected":""}`});
      const attrs={d,fill:"none",stroke:"#9ab1c5","stroke-width":selected.has(key("edge",e.id))?3:2};
      if(e.type==="directed"||e.type==="bidirectional")attrs["marker-end"]="url(#graph-arrow)";
      if(e.type==="bidirectional")attrs["marker-start"]="url(#graph-arrow-reverse)";
      svgElement("path",attrs,grp);
      svgElement("path",{d,fill:"none",stroke:"transparent","stroke-width":17,class:"graph-edge-hit"},grp);
      if(e.label){const m=middle(points);const t=svgElement("text",{x:m.x,y:m.y-8,"text-anchor":"middle",class:"graph-edge-label","pointer-events":"none"},grp);t.textContent=e.label;}
      if(selected.has(key("edge",e.id)))e.waypoints.forEach((p,i)=>svgElement("circle",{cx:p.x,cy:p.y,r:7,class:"graph-waypoint","data-kind":"waypoint","data-id":e.id,"data-index":i},svg));
    }
    for(const n of graph.nodes){const grp=svgElement("g",{"data-kind":"node","data-id":n.id,class:`graph-node ${selected.has(key("node",n.id))?"selected":""}`});
      svgElement("rect",{x:n.x-n.size/2,y:n.y-nodeHeight()/2,width:n.size,height:nodeHeight(),rx:11,fill:n.color,"fill-opacity":0.2,stroke:n.color,"stroke-width":selected.has(key("node",n.id))?3.5:2},grp);
      const label=svgElement("text",{x:n.x,y:n.y+5,"text-anchor":"middle",class:"graph-node-label","pointer-events":"none"},grp);
      const count=Math.max(5,Math.floor(n.size/13));label.textContent=n.label.length>count?n.label.slice(0,count-1)+"…":n.label;
      if(n.description){const tip=svgElement("title",{},grp);tip.textContent=n.description;}
    }
  }
  function statusText(s) {status.textContent=s;}
  function save() {
    try{localStorage.setItem(STORE,JSON.stringify(graph));statusText("下書きをこのブラウザに保存しました");}
    catch(e){statusText("保存不可：ブラウザのストレージを確認してください");}
  }
  function changed() {draw();save();}
  function inspect() {
    if(selected.size!==1){inspector.innerHTML=selected.size?`<p>${selected.size}個選択中。ドラッグでまとめて移動できます。</p>`:"<p>ノード、辺、グループを選択すると、ここで内容を編集できます。</p>";return;}
    const [type,id]=[...selected][0].split(":");const obj=lookup(type,id);
    if(!obj){inspector.textContent="";return;}
    if(type==="node")inspector.innerHTML=`<h3>ノード</h3><label>ラベル<input data-field="label" maxlength="150" value="${escapeHtml(obj.label)}"></label><label>説明<textarea data-field="description" rows="5" maxlength="3000">${escapeHtml(obj.description)}</textarea></label><label>横幅 <output id="graph-node-size">${obj.size}</output><input type="range" min="80" max="300" step="5" data-field="size" value="${obj.size}"></label><label>色<input type="color" data-field="color" value="${obj.color}"></label>`;
    else if(type==="edge")inspector.innerHTML=`<h3>エッジ</h3><label>ラベル<input data-field="label" maxlength="150" value="${escapeHtml(obj.label)}"></label><label>種類<select data-field="type"><option value="undirected">無向辺</option><option value="directed">有向辺</option><option value="bidirectional">双方向</option></select></label><button type="button" id="graph-add-waypoint">経由点を追加</button><p class="graph-help">経由点の丸いハンドルをドラッグして位置を変更できます。</p>`;
    else if(type==="group")inspector.innerHTML=`<h3>グループ</h3><label>名前<input data-field="name" maxlength="150" value="${escapeHtml(obj.name)}"></label><label>領域の色<input type="color" data-field="color" value="${obj.color}"></label><fieldset><legend>所属ノード</legend>${graph.nodes.map(n=>`<label class="graph-check"><input type="checkbox" data-node-id="${escapeHtml(n.id)}" ${obj.nodeIds.includes(n.id)?"checked":""}>${escapeHtml(n.label)}</label>`).join("")}</fieldset>`;
    if(type==="edge")inspector.querySelector("select").value=obj.type;
  }
  function select(kind,id,ctrl){const k=key(kind,id);if(ctrl){if(selected.has(k))selected.delete(k);else selected.add(k);}else if(!selected.has(k))selected=new Set([k]);draw();inspect();}
  function newNode(){const c=pointAt({clientX:svg.getBoundingClientRect().left+svg.clientWidth/2,clientY:svg.getBoundingClientRect().top+svg.clientHeight/2});const n={id:uid(),x:c.x+(graph.nodes.length%4-1.5)*220,y:c.y+(Math.floor(graph.nodes.length/4)-1)*110,label:"新しいノード",description:"",size:150,color:DEFAULT_COLOR};graph.nodes.push(n);selected=new Set([key("node",n.id)]);changed();inspect();}
  function newGroup(){const ids=[...selected].filter(x=>x.startsWith("node:")).map(x=>x.slice(5));if(!ids.length){statusText("Ctrl+クリックでグループに入れるノードを選択してください");return;}
    const g={id:uid(),name:"新しいグループ",color:"#8b5cf6",nodeIds:ids};graph.groups.push(g);selected=new Set([key("group",g.id)]);changed();inspect();}
  function removeSelected(){if(!selected.size)return;
    const delNodes=new Set([...selected].filter(x=>x.startsWith("node:")).map(x=>x.slice(5)));
    graph.nodes=graph.nodes.filter(n=>!delNodes.has(n.id));
    const delEdges=new Set([...selected].filter(x=>x.startsWith("edge:")).map(x=>x.slice(5)));
    graph.edges=graph.edges.filter(e=>!delEdges.has(e.id)&&!delNodes.has(e.from)&&!delNodes.has(e.to));
    const delGroups=new Set([...selected].filter(x=>x.startsWith("group:")).map(x=>x.slice(6)));
    graph.groups=graph.groups.filter(g=>!delGroups.has(g.id)).map(g=>({...g,nodeIds:g.nodeIds.filter(id=>!delNodes.has(id))})).filter(g=>g.nodeIds.length);
    selected.clear();changed();inspect();}
  function pointAt(ev){const p=svg.createSVGPoint();p.x=ev.clientX;p.y=ev.clientY;const m=svg.getScreenCTM();return m?p.matrixTransform(m.inverse()):{x:0,y:0};}
  function moveSelection(dx,dy){const moveNodes=new Set();const moveEdges=new Set();
    for(const item of selected){const [type,id]=item.split(":");
      if(type==="node")moveNodes.add(id);
      if(type==="edge"){const e=lookup("edge",id);if(e){moveNodes.add(e.from);moveNodes.add(e.to);moveEdges.add(id);}}
      if(type==="group"){const g=lookup("group",id);if(!g)continue;g.nodeIds.forEach(i=>moveNodes.add(i));graph.edges.forEach(e=>{if(g.nodeIds.includes(e.from)&&g.nodeIds.includes(e.to))moveEdges.add(e.id);});}
    }
    for(const n of graph.nodes)if(moveNodes.has(n.id)){n.x+=dx;n.y+=dy;}
    for(const e of graph.edges)if(moveEdges.has(e.id))for(const p of e.waypoints){p.x+=dx;p.y+=dy;}
  }
  svg.addEventListener("pointerdown",ev=>{
    if(ev.button!==0)return;
    const el=ev.target.closest("[data-kind]");const kind=el?.getAttribute("data-kind")||"background";
    const id=el?.getAttribute("data-id");
    if(action==="connect"){
      if(kind!=="node"){statusText("接続したい2つのノードを順にクリックしてください");return;}
      if(!edgeStart){edgeStart=id;statusText("接続先のノードをクリックしてください");}
      else{const e={id:uid(),from:edgeStart,to:id,type:"undirected",label:"",waypoints:[]};graph.edges.push(e);edgeStart=null;action=null;$("graph-connect").classList.remove("active");selected=new Set([key("edge",e.id)]);changed();inspect();}
      return;
    }
    const p=pointAt(ev);
    if(kind==="waypoint"){
      selected=new Set([key("edge",id)]);inspect();draw();drag={kind:"waypoint",id,index:Number(el.getAttribute("data-index")),last:p,moved:false};
    }else if(kind==="background"){
      if(!ev.ctrlKey&&!ev.metaKey){selected.clear();inspect();draw();}
      drag={kind:"pan",last:p,moved:false};
    }else if(["node","edge","group"].includes(kind)){
      const was=selected.has(key(kind,id));select(kind,id,ev.ctrlKey||ev.metaKey);
      if(ev.ctrlKey||ev.metaKey){drag=null;return;}
      if(was||selected.has(key(kind,id)))drag={kind:"selection",last:p,moved:false};
    }
    if(drag){svg.setPointerCapture(ev.pointerId);ev.preventDefault();}
  });
  svg.addEventListener("pointermove",ev=>{
    if(!drag)return;
    const p=pointAt(ev);const dx=p.x-drag.last.x,dy=p.y-drag.last.y;
    if(Math.hypot(dx,dy)<0.05)return;
    drag.moved=true;
    if(drag.kind==="waypoint"){
      const waypoint=lookup("edge",drag.id)?.waypoints[drag.index];if(waypoint){waypoint.x+=dx;waypoint.y+=dy;}
    }else if(drag.kind==="selection")moveSelection(dx,dy);
    else if(drag.kind==="pan"){view.x-=dx;view.y-=dy;}
    // viewBoxの移動はポインタの座標変換も変えるので、パンはスクリーン座標による差分が必要。
    drag.last=pointAt(ev);
    draw();
  });
  function stopDrag(){if(drag?.moved&&drag.kind!=="pan")save();drag=null;}
  svg.addEventListener("pointerup",stopDrag);svg.addEventListener("pointercancel",stopDrag);
  svg.addEventListener("wheel",ev=>{
    ev.preventDefault();const p=pointAt(ev);const zoom=ev.deltaY>0?1.12:1/1.12;
    const w=clamp(view.w*zoom,250,10000);const ratio=w/view.w;
    view={x:p.x-(p.x-view.x)*ratio,y:p.y-(p.y-view.y)*ratio,w,h:view.h*ratio};draw();
  },{passive:false});
  inspector.addEventListener("input",ev=>{
    if(selected.size!==1)return;const [type,id]=[...selected][0].split(":");const item=lookup(type,id);if(!item)return;
    const field=ev.target?.dataset.field;if(field){item[field]=field==="size"?clamp(Number(ev.target.value),80,300):ev.target.value;
      if(field==="size")$("graph-node-size").textContent=item.size;
      changed();
    }
  });
  inspector.addEventListener("change",ev=>{
    const field=ev.target.dataset.field;
    if(field){const [type,id]=[...selected][0].split(":");const item=lookup(type,id);if(item){item[field]=ev.target.value;changed();}return;}
    const nodeId=ev.target.dataset.nodeId;if(!nodeId||selected.size!==1)return;
    const [type,id]=[...selected][0].split(":");if(type!=="group")return;
    const group=lookup(type,id);
    if(ev.target.checked&&!group.nodeIds.includes(nodeId))group.nodeIds.push(nodeId);
    if(!ev.target.checked){if(group.nodeIds.length===1){ev.target.checked=true;statusText("グループには最低1つのノードが必要です");return;}group.nodeIds=group.nodeIds.filter(n=>n!==nodeId);}
    changed();
  });
  inspector.addEventListener("click",ev=>{
    if(ev.target.id!=="graph-add-waypoint"||selected.size!==1)return;
    const [type,id]=[...selected][0].split(":");if(type!=="edge")return;
    const edge=lookup(type,id);const pts=route(edge),mid=middle(pts);
    edge.waypoints.push({x:mid.x,y:mid.y});changed();inspect();
  });
  $("graph-add-node").addEventListener("click",newNode);
  $("graph-connect").addEventListener("click",()=>{action=action==="connect"?null:"connect";edgeStart=null;$("graph-connect").classList.toggle("active",action==="connect");statusText(action?"始点と終点のノードをクリックしてください":"エッジ追加を中止しました");});
  $("graph-add-group").addEventListener("click",newGroup);
  $("graph-delete").addEventListener("click",removeSelected);
  $("graph-save").addEventListener("click",save);
  $("graph-view").addEventListener("click",()=>{view={x:0,y:0,w:1200,h:760};draw();});
  $("graph-export").addEventListener("click",()=>{
    const blob=new Blob([JSON.stringify(graph,null,2)+"\n"],{type:"application/json"});
    const url=URL.createObjectURL(blob),link=document.createElement("a");link.href=url;link.download="graph.json";document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
    statusText("graph.json をダウンロードしました");
  });
  $("graph-import").addEventListener("change",async ev=>{
    const file=ev.target.files?.[0];if(!file)return;
    try{const loaded=normalize(JSON.parse(await file.text()));if(!confirm("現在の下書きを読み込んだJSONで置き換えますか？"))return;graph=loaded;selected.clear();changed();inspect();}
    catch(err){statusText(`読み込みエラー: ${err.message}`);}finally{ev.target.value="";}
  });
  $("graph-reset").addEventListener("click",()=>{
    if(!confirm("ブラウザ内の下書きを破棄して、GitHubに公開済みのグラフへ戻しますか？"))return;
    graph=normalize(JSON.parse(published));selected.clear();localStorage.removeItem(STORE);draw();inspect();statusText("公開版へ戻しました");
  });
  $("graph-publish").addEventListener("click",async()=>{
    const json=JSON.stringify(graph,null,2)+"\n";
    try{await navigator.clipboard.writeText(json);statusText("JSONをコピーしました。GitHubの編集画面に貼り付けてコミットしてください");}
    catch{statusText("コピーに失敗しました。「JSON出力」で保存してGitHubへアップロードしてください");}
    window.open("https://github.com/ctenidium28/ledger/edit/main/content/graph.json","_blank","noopener,noreferrer");
  });
  window.addEventListener("keydown",ev=>{
    if((ev.key==="Delete"||ev.key==="Backspace")&&!/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName||"")){ev.preventDefault();removeSelected();}
    if(ev.key==="Escape"&&action==="connect"){action=null;edgeStart=null;$("graph-connect").classList.remove("active");statusText("操作を中止しました");}
  });
  async function init(){
    try{const response=await fetch(`./data/graph.json?v=${Date.now()}`,{cache:"no-store"});if(response.ok){graph=normalize(await response.json());published=JSON.stringify(graph);}}
    catch(e){statusText("公開グラフを取得できなかったため、空のグラフから開始します");}
    try{const draft=localStorage.getItem(STORE);if(draft){graph=normalize(JSON.parse(draft));statusText("保存済みのローカル下書きを読み込みました");}}
    catch(e){statusText("保存済み下書きの読み込みに失敗しました");}
    draw();inspect();
  }
  init();
})();
