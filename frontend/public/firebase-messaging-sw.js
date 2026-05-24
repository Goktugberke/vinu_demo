importScripts('https://www.gstatic.com/firebasejs/12.13.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.13.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyDt2BOs-TMbHKswFQ2rTqK7p4Dp_QXeAYQ',
  authDomain: 'vinu-demo.firebaseapp.com',
  projectId: 'vinu-demo',
  storageBucket: 'vinu-demo.firebasestorage.app',
  messagingSenderId: '579495329766',
  appId: '1:579495329766:web:69af3f56059bb3f3496027',
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[SW] Background message:', payload);

  const notificationTitle = payload.notification?.title || 'Large USDT Transfer';
  const notificationOptions = {
    body: payload.notification?.body || '',
    icon: '/next.svg', 
    data: payload.data, 
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
