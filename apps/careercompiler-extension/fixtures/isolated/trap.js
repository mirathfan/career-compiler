window.syntheticSubmissionAttempts=0;
const trap=event=>{window.syntheticSubmissionAttempts++;event?.preventDefault();document.getElementById("validation").textContent="FAIL: submission attempted";};
document.addEventListener("submit",trap,true);document.getElementById("submit").addEventListener("click",trap);
HTMLFormElement.prototype.submit=function(){trap();};HTMLFormElement.prototype.requestSubmit=function(){trap();};
document.getElementById("next").addEventListener("click",()=>{document.getElementById("step-two").hidden=false;});
if(location.pathname==="/dynamic.html")setTimeout(()=>{const label=document.createElement("label");label.textContent="Portfolio URL";const input=document.createElement("input");input.id="dynamic-portfolio";label.append(input);document.querySelector("form").prepend(label);},100);
document.addEventListener("click",e=>{if(e.target.closest("a")?.href.startsWith("http"))e.preventDefault();},true);
