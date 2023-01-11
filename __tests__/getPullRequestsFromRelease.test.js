const lib = require("../lib.js");

const { getPullRequestsFromRelease } = lib;

it("correctly extracts pull request ids from release description", () => {
  const result = getPullRequestsFromRelease(
    {
      body: `add readme @janczizikow in (#1)`,
    },
    new RegExp("#(?<pr>\\d+)"),
    {
      debug: (msg) => {
        console.debug(msg);
      },
    }
  );
  expect(result).toStrictEqual([1]);
});
