self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('push',event=>{
  let message={title:'Picas y Fijas',body:'Es tu turno.',tag:'pf-turn',url:'/'};
  try{if(event.data)message={...message,...event.data.json()};}catch(e){}
  event.waitUntil(self.registration.showNotification(message.title,{
    body:message.body,tag:message.tag,renotify:true,data:{url:message.url||'/'},
    icon:'/icon-192.png',badge:'/icon-192.png'
  }));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  event.waitUntil((async()=>{
    const target=new URL(event.notification.data?.url||'/',self.location.origin).href;
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    if(windows.length){await windows[0].navigate(target);await windows[0].focus();return;}
    await self.clients.openWindow(target);
  })());
});
