importScripts('https://www.gstatic.com/firebasejs/12.13.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.13.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyDt2BOs-TMbHKswFQ2rTqK7p4Dp_QXeAYQ',
  authDomain: 'vinu-demo.firebaseapp.com',
  projectId: 'vinu-demo',
  storageBucket: 'vinu-demo.firebasestorage.app',
  messagingSenderId: '1056478923456',
  appId: '1:1056478923456:web:a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6',
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
