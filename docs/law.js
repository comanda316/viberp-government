const term=document.querySelector('#q'),group=document.querySelector('#group');
function filter(){
 const query=term.value.trim().toLocaleLowerCase('ru');let count=0;
 for(const section of document.querySelectorAll('.lawgroup')){
 const selected=!group.value||section.id==='group-'+group.value;
 const entries=[...section.querySelectorAll('.law')];let visible=0;
 for(const entry of entries){entry.hidden=!selected||!entry.textContent.toLocaleLowerCase('ru').includes(query);if(!entry.hidden)visible++;}
 section.hidden=!selected||(entries.length?visible===0:Boolean(query));count+=visible;
 }
 document.querySelector('#count').textContent='Найдено документов: '+count;
}
term.oninput=filter;group.onchange=filter;filter();