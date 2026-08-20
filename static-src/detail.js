const config = window.ALEJO_CONFIG || {};
const phone = String(config.phone || "+16789271739");
const digits = phone.replace(/\D/g, "");
const id = new URLSearchParams(location.search).get("id") || "";
const text = (value) => String(value ?? "").trim();
const number = (value) => Number(String(value ?? "0").replace(/[^0-9.-]/g, "")) || 0;
const titleCase = (value) => text(value).toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
const name = (vehicle) => `${vehicle.year || ""} ${titleCase(vehicle.make)} ${titleCase(vehicle.model)} ${text(vehicle.trim)}`.replace(/\s+/g, " ").trim();
const money = (value) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(number(value));
const valid = (snapshot) => snapshot?.contract === "alejo-motors.public-inventory.v1" && snapshot.schemaVersion === 1 && Array.isArray(snapshot.vehicles) && snapshot.vehicles.length > 0;
const photoUrl = (photo, size) => typeof photo === "string" ? photo : photo?.[size] || photo?.fallback || "";
let vehicle = null; let index = 0;
let zoom = 1; let panX = 0; let panY = 0; let dragging = false; let dragStartX = 0; let dragStartY = 0;
const zoomPointers = new Map();
let pinchStartDistance = 0; let pinchStartZoom = 1; let pointerDownAt = 0; let pointerMoved = false; let pinching = false;

async function inventory() {
  let snapshot = null;
  try { const response = await fetch("data/public-inventory.json", { cache: "no-cache" }); if (response.ok) snapshot = await response.json(); } catch {}
  if (!valid(snapshot)) { try { const saved = JSON.parse(localStorage.getItem("alejo-public-inventory-v1") || "null"); if (valid(saved)) snapshot = saved; } catch {} }
  if (config.inventoryEndpoint) { try { const response = await fetch(config.inventoryEndpoint, { cache: "no-store" }); const live = response.ok ? await response.json() : null; if (valid(live) && (!snapshot || live.version >= snapshot.version)) snapshot = live; } catch {} }
  return snapshot;
}

function contactMessage() { return encodeURIComponent(`Hi Alejo Motors, I am interested in ${name(vehicle)}${vehicle.stock ? `, stock ${vehicle.stock}` : ""}. ${location.href}`); }
function setContacts() { const message = contactMessage(); for (const selector of ["#detailCall", "#mobileCall"]) document.querySelector(selector).href = `tel:${phone}`; for (const selector of ["#detailText", "#mobileText"]) document.querySelector(selector).href = `sms:${phone}?&body=${message}`; for (const selector of ["#detailWhatsApp", "#mobileWhatsApp"]) document.querySelector(selector).href = `https://wa.me/${digits}?text=${message}`; }
function showPhoto(next) { const photos = vehicle.photos || []; if (!photos.length) return; index = (next + photos.length) % photos.length; const main = document.querySelector("#mainPhoto"); main.src = photoUrl(photos[index], "detail"); main.alt = `${name(vehicle)} photo ${index + 1}`; document.querySelector("#photoCount").textContent = `${index + 1}/${photos.length}`; [...document.querySelectorAll(".thumbnails button")].forEach((button, position) => button.classList.toggle("active", position === index)); }
function applyZoom() { const image=document.querySelector("#lightboxPhoto"); image.style.transform=`translate3d(${panX}px,${panY}px,0) scale(${zoom})`; image.classList.toggle("zoomed",zoom>1); document.querySelector("#zoomReset").textContent=`${Math.round(zoom*100)}%`; }
function setZoom(next) { zoom=Math.min(5,Math.max(1,next)); if(zoom===1){panX=0;panY=0;} applyZoom(); }
function pointerDistance() { const points=[...zoomPointers.values()]; return points.length<2?0:Math.hypot(points[0].x-points[1].x,points[0].y-points[1].y); }
function syncLightboxPhoto() { const photos=vehicle?.photos||[]; if(!photos.length)return; const image=document.querySelector("#lightboxPhoto"); image.src=photoUrl(photos[index],"detail"); image.alt=`${name(vehicle)} full photo ${index+1}`; document.querySelector("#lightboxCount").textContent=`${index+1}/${photos.length}`; zoom=1;panX=0;panY=0;applyZoom(); }
function openLightbox() { if(!vehicle?.photos?.length)return; syncLightboxPhoto(); const viewer=document.querySelector("#photoLightbox"); viewer.hidden=false; document.body.classList.add("lightbox-open"); document.querySelector("#closeLightbox").focus(); }
function closeLightbox() { document.querySelector("#photoLightbox").hidden=true; document.body.classList.remove("lightbox-open"); zoomPointers.clear(); dragging=false;pinching=false; document.querySelector("#mainPhoto").focus(); }
function lightboxPhoto(next) { showPhoto(next); syncLightboxPhoto(); }
function render() {
  document.querySelector("#detailLoading").hidden = true; document.querySelector("#vehicleDetail").hidden = false;
  document.querySelector("#detailStatus").textContent = vehicle.status === "sold" ? "Sold" : "Available";
  document.querySelector("#detailStock").textContent = vehicle.stock ? `Stock #${vehicle.stock}` : "Alejo Motors";
  document.querySelector("#detailName").textContent = name(vehicle);
  document.querySelector("#detailPrice").textContent = vehicle.status === "sold" ? "Sold" : money(vehicle.price);
  document.querySelector("#detailMileage").textContent = number(vehicle.mileage) ? `${new Intl.NumberFormat("en-US").format(number(vehicle.mileage))} miles` : text(vehicle.mileage);
  const specs = [["Engine",vehicle.engine],["Transmission",/^aut$/i.test(text(vehicle.transmission))?"Automatic":vehicle.transmission],["Drivetrain",vehicle.drivetrain],["Fuel",vehicle.fuelType],["Exterior",vehicle.exteriorColor],["Interior",vehicle.interiorColor],["Title",vehicle.titleType]].filter(([,value])=>text(value));
  document.querySelector("#detailSpecs").replaceChildren(...specs.map(([label,value])=>{const div=document.createElement("div");const dt=document.createElement("dt");const dd=document.createElement("dd");dt.textContent=label;dd.textContent=text(value);div.append(dt,dd);return div;}));
  document.querySelector("#detailDescription").textContent = text(vehicle.description) || "Contact Alejo Motors for complete vehicle information.";
  document.title = `${name(vehicle)} | Alejo Motors Autosales`;
  document.querySelector('meta[name="description"]').content = `${name(vehicle)}, ${text(vehicle.mileage)} miles, available from Alejo Motors Autosales.`;
  document.querySelector('meta[property="og:title"]').content = `${name(vehicle)} | Alejo Motors`;
  document.querySelector('meta[property="og:description"]').content = `${text(vehicle.mileage)} miles. Contact Alejo Motors for availability.`;
  document.querySelector('meta[property="og:url"]').content = location.href;
  const socialImage=photoUrl((vehicle.photos||[])[0],"detail");if(socialImage){const meta=document.createElement("meta");meta.property="og:image";meta.content=new URL(socialImage,location.href).href;document.head.append(meta);}
  const thumbnails = document.querySelector("#thumbnails"); thumbnails.replaceChildren(...(vehicle.photos || []).map((item, position)=>{const button=document.createElement("button");const image=document.createElement("img");image.src=photoUrl(item,"thumbnail");image.alt=`${name(vehicle)} thumbnail ${position+1}`;image.loading="lazy";button.addEventListener("click",()=>showPhoto(position));button.append(image);return button;}));
  showPhoto(0); setContacts();
  if (vehicle.status === "sold") {
    document.querySelectorAll("#detailCall,#detailText,#detailWhatsApp").forEach((action) => { action.hidden = true; });
    document.querySelector(".detail-contact").hidden = true;
    document.querySelector(".mobile-contact").hidden = true;
  }
  const structured = { "@context":"https://schema.org", "@type":"Vehicle", name:name(vehicle), mileageFromOdometer:number(vehicle.mileage)?{ "@type":"QuantitativeValue", value:number(vehicle.mileage), unitCode:"SMI"}:undefined, offers:{ "@type":"Offer", price:number(vehicle.price), priceCurrency:"USD", availability:vehicle.status==="available"?"https://schema.org/InStock":"https://schema.org/SoldOut", url:location.href }, image:(vehicle.photos||[]).map((item)=>photoUrl(item,"detail")) };
  const script=document.createElement("script");script.type="application/ld+json";script.textContent=JSON.stringify(structured);document.head.append(script);
}

document.querySelector("#previousPhoto").addEventListener("click",()=>showPhoto(index-1)); document.querySelector("#nextPhoto").addEventListener("click",()=>showPhoto(index+1));
document.querySelector("#mainPhoto").addEventListener("click",openLightbox);
document.querySelector("#mainPhoto").addEventListener("keydown",(event)=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();openLightbox();}});
document.querySelector("#closeLightbox").addEventListener("click",closeLightbox);
document.querySelector("#photoLightbox").addEventListener("click",(event)=>{if(event.target===event.currentTarget)closeLightbox();});
document.querySelector(".photo-lightbox-stage").addEventListener("click",(event)=>{if(event.target===event.currentTarget)closeLightbox();});
document.querySelector("#lightboxViewport").addEventListener("click",(event)=>{if(event.target===event.currentTarget)closeLightbox();});
document.querySelector("#lightboxPrevious").addEventListener("click",()=>lightboxPhoto(index-1));
document.querySelector("#lightboxNext").addEventListener("click",()=>lightboxPhoto(index+1));
document.querySelector("#zoomIn").addEventListener("click",()=>setZoom(zoom+.5));
document.querySelector("#zoomOut").addEventListener("click",()=>setZoom(zoom-.5));
document.querySelector("#zoomReset").addEventListener("click",()=>setZoom(zoom===1?2:1));
document.querySelector("#lightboxViewport").addEventListener("wheel",(event)=>{event.preventDefault();setZoom(zoom+(event.deltaY < 0 ? .25 : -.25));},{passive:false});
document.querySelector("#lightboxPhoto").addEventListener("dblclick",()=>setZoom(zoom===1?2.5:1));
document.querySelector("#lightboxPhoto").addEventListener("pointerdown",(event)=>{pointerDownAt=Date.now();pointerMoved=false;zoomPointers.set(event.pointerId,{x:event.clientX,y:event.clientY});event.currentTarget.setPointerCapture(event.pointerId);if(zoomPointers.size===2){pinching=true;pinchStartDistance=pointerDistance();pinchStartZoom=zoom;dragging=false;}else if(zoom>1){dragging=true;dragStartX=event.clientX-panX;dragStartY=event.clientY-panY;}});
document.querySelector("#lightboxPhoto").addEventListener("pointermove",(event)=>{if(!zoomPointers.has(event.pointerId))return;const previous=zoomPointers.get(event.pointerId);if(Math.hypot(event.clientX-previous.x,event.clientY-previous.y)>3)pointerMoved=true;zoomPointers.set(event.pointerId,{x:event.clientX,y:event.clientY});if(zoomPointers.size>=2&&pinchStartDistance>0){setZoom(pinchStartZoom*(pointerDistance()/pinchStartDistance));return;}if(!dragging||zoom<=1)return;panX=event.clientX-dragStartX;panY=event.clientY-dragStartY;applyZoom();});
function releaseZoomPointer(event){const wasPinching=pinching;zoomPointers.delete(event.pointerId);if(zoomPointers.size<2){pinching=false;pinchStartDistance=0;}if(!zoomPointers.size){dragging=false;if(event.pointerType==="touch"&&!wasPinching&&!pointerMoved&&Date.now()-pointerDownAt<350)setZoom(zoom===1?2.5:1);}else if(zoom>1){const remaining=[...zoomPointers.values()][0];dragging=true;dragStartX=remaining.x-panX;dragStartY=remaining.y-panY;}}
document.querySelector("#lightboxPhoto").addEventListener("pointerup",releaseZoomPointer);
document.querySelector("#lightboxPhoto").addEventListener("pointercancel",releaseZoomPointer);
document.addEventListener("keydown",(event)=>{if(document.querySelector("#photoLightbox").hidden)return;if(event.key==="Escape")closeLightbox();if(event.key==="ArrowLeft")lightboxPhoto(index-1);if(event.key==="ArrowRight")lightboxPhoto(index+1);if(event.key==="+")setZoom(zoom+.5);if(event.key==="-")setZoom(zoom-.5);});
document.querySelector("#shareVehicle").addEventListener("click",async()=>{const data={title:name(vehicle),text:`See ${name(vehicle)} at Alejo Motors`,url:location.href};if(navigator.share)await navigator.share(data);else{await navigator.clipboard.writeText(location.href);document.querySelector("#shareVehicle").textContent="Link copied";}});
let touchStart=0;document.querySelector(".main-photo").addEventListener("touchstart",(event)=>{touchStart=event.touches[0].clientX},{passive:true});document.querySelector(".main-photo").addEventListener("touchend",(event)=>{const end=event.changedTouches[0].clientX;if(Math.abs(end-touchStart)>45)showPhoto(index+(end<touchStart?1:-1));},{passive:true});

const leadForm=document.querySelector("#detailLeadForm");const leadState=document.querySelector("#detailLeadState");let sending=false;
leadForm.addEventListener("submit",async(event)=>{event.preventDefault();if(sending||!vehicle||!leadForm.reportValidity())return;if(!config.leadEndpoint){leadState.textContent="Online inquiries are not enabled in this preview. Please call, text or WhatsApp.";return;}const form=new FormData(leadForm);const payload={requestId:crypto.randomUUID(),vehicleId:vehicle.id,stock:text(vehicle.stock),name:text(form.get("name")),phone:text(form.get("phone")),email:text(form.get("email")),message:text(form.get("message")),website:text(form.get("website")),source:"Alejo Motors vehicle detail"};sending=true;leadForm.querySelector("button[type=submit]").disabled=true;leadState.textContent="Sending…";try{const response=await fetch(config.leadEndpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});if(!response.ok)throw new Error();leadForm.reset();leadState.textContent="Thank you. Alejo Motors received your inquiry.";}catch{leadState.textContent="The form could not send. Please call, text or WhatsApp.";}finally{sending=false;leadForm.querySelector("button[type=submit]").disabled=false;}});

const snapshot = await inventory(); vehicle = snapshot?.vehicles?.find((item)=>String(item.id)===id) || null;
if (vehicle) { render(); leadForm.elements.message.value=`I am interested in ${name(vehicle)}${vehicle.stock?`, stock ${vehicle.stock}`:""}.`; } else { document.querySelector("#detailLoading").hidden=true; document.querySelector("#detailError").hidden=false; }
