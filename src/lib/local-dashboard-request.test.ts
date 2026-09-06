import assert from "node:assert/strict";
import test from "node:test";
import { isLocalDashboardRequestHeaders } from "./local-dashboard-request";

function requestHeaders(values: Record<string, string | undefined>) {
  return {
    get(name: string) {
      return values[name.toLowerCase()] ?? null;
    },
  };
}

test("accepts a same-origin loopback dashboard request", () => {
  assert.equal(isLocalDashboardRequestHeaders(requestHeaders({
    host: "localhost:3000",
    origin: "http://localhost:3000",
    "sec-fetch-site": "same-origin",
  })), true);
  assert.equal(isLocalDashboardRequestHeaders(requestHeaders({
    host: "127.0.0.1:3000",
    origin: "http://127.0.0.1:3000",
    "x-forwarded-host": "127.0.0.1:3000",
    "x-forwarded-proto": "http",
  })), true);
});

test("rejects a forged loopback origin on a non-local host", () => {
  assert.equal(isLocalDashboardRequestHeaders(requestHeaders({
    host: "demo.example.test",
    origin: "http://localhost:3000",
  })), false);
  assert.equal(isLocalDashboardRequestHeaders(requestHeaders({
    host: "localhost:3000",
    origin: "http://localhost:3000",
    "x-forwarded-host": "demo.example.test",
  })), false);
});

test("rejects missing, cross-origin, or non-http request metadata", () => {
  assert.equal(isLocalDashboardRequestHeaders(requestHeaders({ host: "localhost:3000" })), false);
  assert.equal(isLocalDashboardRequestHeaders(requestHeaders({
    host: "127.0.0.1:3000",
    origin: "http://localhost:3000",
  })), false);
  assert.equal(isLocalDashboardRequestHeaders(requestHeaders({
    host: "localhost:3000",
    origin: "https://localhost:3000",
  })), false);
  assert.equal(isLocalDashboardRequestHeaders(requestHeaders({
    host: "localhost:3000",
    origin: "http://localhost:3000",
    "sec-fetch-site": "cross-site",
  })), false);
});
