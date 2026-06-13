/// <reference types="vite/client" />

/* vite.config.ts の define で注入される。API接続先(空文字ならオフライン=ローカル版) */
declare const __API_URL__: string;
