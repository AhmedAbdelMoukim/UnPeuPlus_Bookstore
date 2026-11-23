'use strict';
document.querySelector('#print-document').addEventListener('click',()=>window.print());
document.querySelectorAll('[data-edit]').forEach(field=>{
  const key='upp-presentation-'+field.dataset.edit;
  try{const saved=localStorage.getItem(key);if(saved)field.textContent=saved;}catch{}
  field.addEventListener('input',()=>{try{localStorage.setItem(key,field.textContent);}catch{}});
  field.addEventListener('paste',event=>{event.preventDefault();const text=event.clipboardData.getData('text/plain');const selection=window.getSelection();if(selection.rangeCount){const range=selection.getRangeAt(0);range.deleteContents();const node=document.createTextNode(text);range.insertNode(node);range.setStartAfter(node);range.collapse(true);selection.removeAllRanges();selection.addRange(range);field.dispatchEvent(new Event('input'));}});
});
