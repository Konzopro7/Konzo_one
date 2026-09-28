import test from "node:test";
import assert from "node:assert/strict";
import { resetLink } from "./passwordReset.js";

test("reset links use configured origins and subpaths, with tokens only in fragments", t => {
  const previous = { url:process.env.PUBLIC_CLIENT_URL,env:process.env.NODE_ENV };
  t.after(() => { for (const [key,value] of [["PUBLIC_CLIENT_URL",previous.url],["NODE_ENV",previous.env]]) { if(value === undefined) delete process.env[key]; else process.env[key]=value; } });
  process.env.PUBLIC_CLIENT_URL="http://localhost/konzotech-one/";
  process.env.NODE_ENV="development";
  const link=new URL(resetLink("fixture"));
  assert.equal(link.pathname,"/konzotech-one/reset-password");
  assert.equal(link.search,""); assert.equal(link.hash,"#token=fixture");
  process.env.NODE_ENV="production";
  assert.throws(() => resetLink("fixture"));
  process.env.PUBLIC_CLIENT_URL="https://konzocrm.com";
  assert.equal(new URL(resetLink("fixture")).origin,"https://konzocrm.com");
  process.env.PUBLIC_CLIENT_URL="https://user:pass@konzocrm.com";
  assert.throws(() => resetLink("fixture"));
});
