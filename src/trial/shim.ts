// 試用版：/api/ への要求を、同じ処理（server/app.ts の handleApi）にブラウザの中で渡す
import { handleApi } from "../../server/app.js";

type Listener = (chunk?: string) => void;
const realFetch = globalThis.fetch.bind(globalThis);

globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
  if (!url.startsWith("/api/")) return realFetch(input, init);
  const body = typeof init?.body === "string" ? init.body : "";
  const listeners: Record<string, Listener[]> = {};
  const req = {
    url,
    method: init?.method ?? "GET",
    on(ev: string, cb: Listener) {
      (listeners[ev] ??= []).push(cb);
      return req;
    },
  };
  return new Promise<Response>((resolve) => {
    let status = 200;
    const res = {
      writeHead(s: number) {
        status = s;
        return res;
      },
      end(text: string) {
        resolve(new Response(text, { status, headers: { "content-type": "application/json" } }));
      },
    };
    void handleApi(req as never, res as never);
    queueMicrotask(() => {
      if (body) listeners.data?.forEach((f) => f(body));
      listeners.end?.forEach((f) => f());
    });
  });
};
export {};
