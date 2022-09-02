const { expect } = require("@jest/globals");
const lib = require("../lib.js");
const nock = require("nock");

function core() {
  return {
    debug: (msg) => {
      console.debug(msg);
    },
    error: (msg) => {
      console.error(msg);
    },
    info: (msg) => {
      console.info(msg);
    },
  };
}

function octokit() {
  const { Octokit } = require("@octokit/core");
  const {
    paginateRest,
    composePaginateRest,
  } = require("@octokit/plugin-paginate-rest");
  const MyOctokit = Octokit.plugin(paginateRest);
  return new MyOctokit({ auth: "secret123" });
}

beforeEach(() => nock.cleanAll());

afterAll(() => {
  nock.restore();
});

beforeAll(() => {
  if (!nock.isActive()) {
    nock.activate();
  }
  nock.enableNetConnect();
});

test("move to completed state", async () => {
  nock("https://api.github.com")
    .get("/repos/owner/repo/issues/100/comments?per_page=100")
    .reply(200, [
      {
        user: {
          login: "shortcut-integration[bot]",
        },
        body: "This pull request has been linked to [Shortcut Story #1000: fix bug](https://app.clubhouse.io/workspace/story/1000/fix-bug).",
      },
    ]);

  nock("https://api.app.shortcut.com")
    .get("/api/v3/workflows")
    .reply(200, [
      {
        id: 2000,
        name: "Workflow1",
        states: [
          {
            id: 2001,
            name: "InDevelopment",
          },
          {
            id: 2002,
            name: "Completed",
          },
          {
            id: 2003,
            name: "Deployed",
          },
        ],
      },
    ]);

  nock("https://api.app.shortcut.com")
    .get("/api/v3/stories/1000")
    .reply(200, {
      workflow_id: 2000,
      workflow_state_id: 2001, // InDevelopment
      pull_requests: [{ number: 100 }], // Links back to PR 100
    });

  let setStoryState = 0;

  nock("https://api.app.shortcut.com")
    .put("/api/v3/stories/1000", (body) => {
      setStoryState = body.workflow_state_id;
      return true;
    })
    .reply(200);

  await lib.main(
    core(),
    { body: "fix: bug-1 @Author (#100)" },
    "owner",
    "repo",
    octokit(),
    "secret123",
    {
      Workflow1: "Deployed",
      Workflow2: "Completed",
    },
    new RegExp("\\(#(?<pr>\\d+)\\)$")
  );

  expect(setStoryState).toBe(2003);
});

test("not moving to completed state", async () => {
  nock("https://api.github.com")
    .get("/repos/owner/repo/issues/100/comments?per_page=100")
    .reply(200, [
      {
        user: {
          login: "shortcut-integration[bot]",
        },
        body: "This pull request has been linked to [Shortcut Story #1000: fix bug](https://app.clubhouse.io/workspace/story/1000/fix-bug).",
      },
    ]);

  nock("https://api.app.shortcut.com")
    .get("/api/v3/workflows")
    .reply(200, [
      {
        id: 2000,
        name: "Workflow1",
        states: [
          {
            id: 2001,
            name: "InDevelopment",
          },
          {
            id: 2002,
            name: "Completed",
          },
          {
            id: 2003,
            name: "Deployed",
          },
        ],
      },
    ]);

  nock("https://api.app.shortcut.com")
    .get("/api/v3/stories/1000")
    .reply(200, {
      workflow_id: 2000,
      workflow_state_id: 2003, // Deployed
      pull_requests: [{ number: 100 }], // Links back to PR 100
    });

  let setStoryState = 0;

  nock("https://api.app.shortcut.com").put("/api/v3/stories/1000", (body) => {
    setStoryState = body.workflow_state_id;
    return true;
  });

  await lib.main(
    core(),
    { body: "fix: bug-1 @Author (#100)" },
    "owner",
    "repo",
    octokit(),
    "secret123",
    {
      Workflow1: "Deployed",
      Workflow2: "Completed",
    },
    new RegExp("\\(#(?<pr>\\d+)\\)$")
  );

  expect(setStoryState).toBe(0);
});

test("not moving unlinked pull requests", async () => {
  nock("https://api.github.com")
    .get("/repos/owner/repo/issues/100/comments?per_page=100")
    .reply(200, [
      {
        user: {
          login: "shortcut-integration[bot]",
        },
        body: "This pull request has been linked to [Shortcut Story #1000: fix bug](https://app.clubhouse.io/workspace/story/1000/fix-bug).",
      },
    ]);

  nock("https://api.app.shortcut.com")
    .get("/api/v3/workflows")
    .reply(200, [
      {
        id: 2000,
        name: "Workflow1",
        states: [
          {
            id: 2001,
            name: "InDevelopment",
          },
          {
            id: 2002,
            name: "Completed",
          },
          {
            id: 2003,
            name: "Deployed",
          },
        ],
      },
    ]);

  nock("https://api.app.shortcut.com").get("/api/v3/stories/1000").reply(200, {
    workflow_id: 2000,
    workflow_state_id: 2001, // InDevelopment
    pull_requests: [], // not linked back
  });

  let setStoryState = 0;

  nock("https://api.app.shortcut.com")
    .put("/api/v3/stories/1000", (body) => {
      setStoryState = body.workflow_state_id;
      return true;
    })
    .reply(200);

  await lib.main(
    core(),
    { body: "fix: bug-1 @Author (#100)" },
    "owner",
    "repo",
    octokit(),
    "secret123",
    {
      Workflow1: "Deployed",
      Workflow2: "Completed",
    },
    new RegExp("\\(#(?<pr>\\d+)\\)$")
  );

  expect(setStoryState).toBe(0);
});

test("moving all linked stories", async () => {
  nock("https://api.github.com")
    .get("/repos/owner/repo/issues/100/comments?per_page=100")
    .reply(200, [
      {
        user: {
          login: "shortcut-integration[bot]",
        },
        body: "This pull request has been linked to [Shortcut Story #1000: fix bug](https://app.clubhouse.io/workspace/story/1000/fix-bug).",
      },
      {
        user: {
          login: "shortcut-integration[bot]",
        },
        body: "This pull request has been linked to [Shortcut Story #1001: introduce feature](https://app.clubhouse.io/workspace/story/1001/introduce-feature).",
      },
    ]);

  nock("https://api.app.shortcut.com")
    .get("/api/v3/workflows")
    .reply(200, [
      {
        id: 2000,
        name: "Workflow1",
        states: [
          {
            id: 2001,
            name: "InDevelopment",
          },
          {
            id: 2002,
            name: "Completed",
          },
          {
            id: 2003,
            name: "Deployed",
          },
        ],
      },
      {
        id: 3000,
        name: "Workflow2",
        states: [
          {
            id: 3001,
            name: "InDevelopment",
          },
          {
            id: 3002,
            name: "Completed",
          },
          {
            id: 3003,
            name: "Deployed",
          },
        ],
      },
    ]);

  nock("https://api.app.shortcut.com")
    .get("/api/v3/stories/1000")
    .reply(200, {
      workflow_id: 2000,
      workflow_state_id: 2001, // InDevelopment
      pull_requests: [{ number: 100 }], // Links back to PR 100
    });

  nock("https://api.app.shortcut.com")
    .get("/api/v3/stories/1001")
    .reply(200, {
      workflow_id: 3000,
      workflow_state_id: 3001, // InDevelopment
      pull_requests: [{ number: 100 }], // Links back to PR 100
    });

  let setStory1000State = 0;
  let setStory1001State = 0;

  nock("https://api.app.shortcut.com")
    .put("/api/v3/stories/1000", (body) => {
      setStory1000State = body.workflow_state_id;
      return true;
    })
    .reply(200);

  nock("https://api.app.shortcut.com")
    .put("/api/v3/stories/1001", (body) => {
      setStory1001State = body.workflow_state_id;
      return true;
    })
    .reply(200);

  await lib.main(
    core(),
    { body: "fix: bug-1 @Author (#100)" },
    "owner",
    "repo",
    octokit(),
    "secret123",
    {
      Workflow1: "Deployed",
      Workflow2: "Completed",
    },
    new RegExp("\\(#(?<pr>\\d+)\\)$")
  );

  expect(setStory1000State).toBe(2003);
  expect(setStory1001State).toBe(3002);
});

test("moving all mentioned pull requests", async () => {
  nock("https://api.github.com")
    .get("/repos/owner/repo/issues/100/comments?per_page=100")
    .reply(200, [
      {
        user: {
          login: "shortcut-integration[bot]",
        },
        body: "This pull request has been linked to [Shortcut Story #1000: fix bug](https://app.clubhouse.io/workspace/story/1000/fix-bug).",
      },
    ]);
  nock("https://api.github.com")
    .get("/repos/owner/repo/issues/101/comments?per_page=100")
    .reply(200, [
      {
        user: {
          login: "shortcut-integration[bot]",
        },
        body: "This pull request has been linked to [Shortcut Story #1001: introduce feature](https://app.clubhouse.io/workspace/story/1001/introduce-feature).",
      },
    ]);

  nock("https://api.app.shortcut.com")
    .get("/api/v3/workflows")
    .reply(200, [
      {
        id: 2000,
        name: "Workflow1",
        states: [
          {
            id: 2001,
            name: "InDevelopment",
          },
          {
            id: 2002,
            name: "Completed",
          },
          {
            id: 2003,
            name: "Deployed",
          },
        ],
      },
      {
        id: 3000,
        name: "Workflow2",
        states: [
          {
            id: 3001,
            name: "InDevelopment",
          },
          {
            id: 3002,
            name: "Completed",
          },
          {
            id: 3003,
            name: "Deployed",
          },
        ],
      },
    ]);

  nock("https://api.app.shortcut.com")
    .get("/api/v3/stories/1000")
    .reply(200, {
      workflow_id: 2000,
      workflow_state_id: 2001, // InDevelopment
      pull_requests: [{ number: 100 }], // Links back to PR 100
    });

  nock("https://api.app.shortcut.com")
    .get("/api/v3/stories/1001")
    .reply(200, {
      workflow_id: 3000,
      workflow_state_id: 3001, // InDevelopment
      pull_requests: [{ number: 101 }], // Links back to PR 101
    });

  let setStory1000State = 0;
  let setStory1001State = 0;

  nock("https://api.app.shortcut.com")
    .put("/api/v3/stories/1000", (body) => {
      setStory1000State = body.workflow_state_id;
      return true;
    })
    .reply(200);

  nock("https://api.app.shortcut.com")
    .put("/api/v3/stories/1001", (body) => {
      setStory1001State = body.workflow_state_id;
      return true;
    })
    .reply(200);

  await lib.main(
    core(),
    {
      body: `
        fix: bug-1 @Author (#100)
        chore: feat-1 @Author (#101)`,
    },
    "owner",
    "repo",
    octokit(),
    "secret123",
    {
      Workflow1: "Deployed",
      Workflow2: "Completed",
    },
    new RegExp("\\(#(?<pr>\\d+)\\)$")
  );

  expect(setStory1000State).toBe(2003);
  expect(setStory1001State).toBe(3002);
});
