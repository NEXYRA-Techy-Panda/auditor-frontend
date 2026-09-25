import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkHealth, parseHealthResponse } from "../health.ts";

const HEALTH_ENVELOPE = {
  data: {
    status: "ok",
    contract_version: "1.0.1",
    ml_reachable: true,
  },
  meta: {
    request_id: "request-1",
  },
};

function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

describe("backend health adapter", () => {
  it("parses the documented data envelope returned by the public API", () => {
    assert.deepEqual(parseHealthResponse(HEALTH_ENVELOPE), {
      status: "ok",
      contractVersion: "1.0.1",
      runId: null,
      simTimeUtc: null,
      mlReachable: true,
      modelAvailable: null,
    });
  });

  it("keeps the bare payload compatibility shape strict", () => {
    const parsed = parseHealthResponse({
      status: "ok",
      contract_version: "1.0.1",
      ml_reachable: "not_checked",
    });
    assert.equal(parsed?.contractVersion, "1.0.1");
    assert.equal(parsed?.mlReachable, "not_checked");
    assert.equal(parseHealthResponse({ data: { status: 123 }, status: "ok" }), null);
  });

  it("classifies the real envelope as reachable", async () => {
    const result = await checkHealth(
      "https://example.test/auditor",
      async (url, init) => {
        assert.equal(url, "https://example.test/auditor/api/v1/health");
        assert.ok(init?.signal);
        return response(HEALTH_ENVELOPE);
      },
      1000,
    );
    assert.equal(result.outcome, "reachable");
    assert.equal(result.data?.contractVersion, "1.0.1");
    assert.equal(result.data?.mlReachable, true);
    assert.equal(result.error, null);
  });
});
