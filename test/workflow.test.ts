import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import YAML from "yaml";

describe("AI fix verification workflow", () => {
  it("supports workflow_dispatch with commit and command inputs", () => {
    const workflow = YAML.parse(readFileSync(".github/workflows/ai-fix-verify.yml", "utf8"));

    expect(workflow.name).toBe("AI Fix Verify");
    expect(workflow.on.workflow_dispatch.inputs.commit_sha.required).toBe(true);
    expect(workflow.on.workflow_dispatch.inputs.commands.required).toBe(true);
    expect(workflow.jobs.verify.steps.map((step: { name?: string }) => step.name)).toContain("Run verification commands");
  });
});
