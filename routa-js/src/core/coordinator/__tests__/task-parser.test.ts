/**
 * TaskParser tests - port of routa-core TaskParserTest.kt
 */

import { describe, it, expect } from "@jest/globals";
import { parseTaskBlocks } from "../task-parser";
import { TaskStatus } from "../../models/task";

describe("TaskParser", () => {
  it("should parse a single task block", () => {
    const input = `
@@@task
# Implement JWT middleware

## Objective
Add authentication middleware to validate JWT tokens

## Scope
- src/middleware/auth.ts
- src/types/auth.ts

## Definition of Done
- Middleware validates JWT tokens
- Returns 401 for invalid tokens
- Adds user info to request context

## Verification
- npm test -- auth.test.ts
@@@
    `.trim();

    const tasks = parseTaskBlocks(input, "test-workspace");

    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe("Implement JWT middleware");
    expect(tasks[0].objective).toContain("authentication middleware");
    expect(tasks[0].acceptanceCriteria).toHaveLength(3);
    expect(tasks[0].acceptanceCriteria[0]).toBe("Middleware validates JWT tokens");
    expect(tasks[0].verificationCommands).toHaveLength(1);
    expect(tasks[0].verificationCommands[0]).toBe("npm test -- auth.test.ts");
    expect(tasks[0].status).toBe(TaskStatus.PENDING);
    expect(tasks[0].workspaceId).toBe("test-workspace");
  });

  it("should parse multiple task blocks", () => {
    const input = `
Here's the plan:

@@@task
# Task 1

## Objective
First task
@@@

@@@task
# Task 2

## Objective
Second task
@@@
    `.trim();

    const tasks = parseTaskBlocks(input, "test-workspace");

    expect(tasks).toHaveLength(2);
    expect(tasks[0].title).toBe("Task 1");
    expect(tasks[1].title).toBe("Task 2");
  });

  it("should handle code blocks inside task blocks", () => {
    const input = `
@@@task
# Run verification script

## Objective
Execute tests

## Verification
\`\`\`bash
# This is a comment, not a task title
npm test
\`\`\`
@@@
    `.trim();

    const tasks = parseTaskBlocks(input, "test-workspace");

    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe("Run verification script");
    // The bash comment should not be treated as a title
  });

  it("should split multi-task blocks", () => {
    const input = `
@@@task
# Task A

## Objective
First

# Task B

## Objective
Second
@@@
    `.trim();

    const tasks = parseTaskBlocks(input, "test-workspace");

    expect(tasks).toHaveLength(2);
    expect(tasks[0].title).toBe("Task A");
    expect(tasks[1].title).toBe("Task B");
  });

  it("should handle markdown heading prefix", () => {
    const input = `
### @@@task
# My Task

## Objective
Do something
@@@
    `.trim();

    const tasks = parseTaskBlocks(input, "test-workspace");

    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe("My Task");
  });

  it("should return empty array for no task blocks", () => {
    const input = "Just some regular text without task blocks";
    const tasks = parseTaskBlocks(input, "test-workspace");
    expect(tasks).toHaveLength(0);
  });

  it("should handle Chinese section names", () => {
    const input = `
@@@task
# 实现用户认证

## 目标
添加JWT认证中间件

## 验收标准
- 验证JWT令牌
- 无效令牌返回401
@@@
    `.trim();

    const tasks = parseTaskBlocks(input, "test-workspace");

    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe("实现用户认证");
    expect(tasks[0].objective).toContain("JWT");
    expect(tasks[0].acceptanceCriteria).toHaveLength(2);
  });
});

