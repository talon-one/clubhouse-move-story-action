const https = require("https");

async function doShortcutRequest(options, data) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      if (res.statusCode !== 200) {
        recject(new Error(`Expected status 200, but got ${res.statusCode}`));
        return;
      }
      res.setEncoding("utf8");
      let responseBody = "";

      res.on("data", (chunk) => {
        responseBody += chunk;
      });

      res.on("end", () => {
        if (responseBody.length > 0) {
          resolve(JSON.parse(responseBody));
        } else {
          resolve();
        }
      });
    });

    req.on("error", (err) => {
      reject(err);
    });

    req.write(data);
    req.end();
  });
}

async function setStoryState(shortcutToken, storyId, workflowStateId) {
  await doShortcutRequest(
    {
      hostname: "api.app.shortcut.com",
      port: 443,
      path: `/api/v3/stories/${storyId}`,
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Shortcut-Token": shortcutToken,
      },
    },
    JSON.stringify({
      workflow_state_id: workflowStateId,
    })
  );
}

async function getWorkflows(shortcutToken) {
  const workflows = await doShortcutRequest(
    {
      hostname: "api.app.shortcut.com",
      port: 443,
      path: "/api/v3/workflows",
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Shortcut-Token": shortcutToken,
      },
    },
    ""
  );
  return workflows;
}

async function getStory(shortcutToken, storyId) {
  const story = await doShortcutRequest(
    {
      hostname: "api.app.shortcut.com",
      port: 443,
      path: `/api/v3/stories/${storyId}`,
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Shortcut-Token": shortcutToken,
      },
    },
    ""
  );
  return story;
}

async function getShortcutStories(
  core,
  octokit,
  shortcutToken,
  owner,
  repo,
  pull_number
) {
  const parameters = {
    owner: owner,
    repo: repo,
    issue_number: pull_number,
    per_page: 100,
  };

  const hasBeenLinkedTo =
    /This pull request has been linked to \[Shortcut Story #(?<id>\d+):/;

  let ids = [];

  for await (const response of octokit.paginate.iterator(
    "GET /repos/{owner}/{repo}/issues/{issue_number}/comments",
    parameters
  )) {
    if (response.status !== 200) {
      throw new Error(
        `expected status 200, but got ${response.status} for ${pull_number}`
      );
    }

    for (const comment of response.data) {
      if (comment.user.login !== "shortcut-integration[bot]") {
        continue;
      }
      const matches = hasBeenLinkedTo.exec(comment.body);
      if (
        matches === null ||
        matches === undefined ||
        matches.groups === null ||
        matches.groups === undefined ||
        matches.groups.id === null ||
        matches.groups.id === undefined
      ) {
        continue;
      }

      try {
        const i = Number.parseInt(matches.groups.id);
        if (Number.isNaN(i)) {
          continue;
        }
        ids.push(i);
      } catch (e) {
        continue;
      }
    }
  }

  core.debug(`${ids.length} stories are mentioned in ${pull_number}`);

  let stories = [];

  // get all stories mentioned in the pull request comments
  for (const id of ids) {
    const story = await getStory(shortcutToken, id);
    if (
      story.pull_requests === undefined ||
      story.pull_requests === null ||
      story.pull_requests.length === 0
    ) {
      // if the story has no pull requests, ingore it.
      core.debug(`story ${id} has no pull requests`);
      continue;
    }

    let hasPullRequest = false;
    for (const pr of story.pull_requests) {
      if (pr.number === pull_number) {
        hasPullRequest = true;
        break;
      }
    }

    if (!hasPullRequest) {
      // if the story does not have this pull request, ignore it
      core.debug(
        `story ${id} has not ${pull_number} referenced`,
        JSON.stringify(story.pull_requests)
      );
      continue;
    }

    stories.push({
      id: id,
      workflow_id: story.workflow_id,
      workflow_state_id: story.workflow_state_id,
    });
  }

  return stories;
}

function getPullRequestsFromRelease(release, prExpression) {
  let pr_ids = [];
  const lines = release.body.split("\n");
  for (const line of lines) {
    let matches = prExpression.exec(line.trim());
    core.debug("matches", matches, "for line", line);
    if (
      matches === null ||
      matches === undefined ||
      matches.groups === null ||
      matches.groups === undefined ||
      matches.groups.pr === null ||
      matches.groups.pr === undefined
    ) {
      continue;
    }
    try {
      const pull_number = Number.parseInt(matches.groups.pr);
      if (Number.isNaN(pull_number)) {
        continue;
      }
      core.debug("PR id found: ", pull_number);
      pr_ids.push(pull_number);
    } catch (e) {
      continue;
    }
  }
  return pr_ids;
}

async function main(
  core,
  release,
  owner,
  repo,
  octokit,
  shortcutToken,
  stateMap,
  prExpression
) {
  core.debug(release);
  core.debug(release.body);
  const pullRequestIds = getPullRequestsFromRelease(release, prExpression);
  if (pullRequestIds.length == 0) {
    core.debug("no pull requests released", pullRequestIds);
    return;
  }

  function getWorkflow(id) {
    for (const w of workflows) {
      if (w.id === id) {
        return w;
      }
    }
    return null;
  }

  function getWorkflowStateId(w, stateName) {
    for (const state of w.states) {
      if (state.name === stateName) {
        return state.id;
      }
    }
    return 0;
  }
  core.debug(`found ${pullRequestIds.length} pull request in release`);

  let workflows = null;

  for (const pr of pullRequestIds) {
    try {
      core.debug(`getting stories for ${pr}`);
      const stories = await getShortcutStories(
        core,
        octokit,
        shortcutToken,
        owner,
        repo,
        pr
      );
      core.debug(`got ${stories.length} stories for ${pr}`);
      for (const story of stories) {
        // fetch workflows if we haven't already
        if (workflows === null) {
          workflows = await getWorkflows(shortcutToken);
          core.debug(`got ${workflows.length} workflows`);
        }

        const workflow = getWorkflow(story.workflow_id);
        if (workflow === null) {
          // workflow does not exist
          core.error(
            `workflow with the id ${story.workflow_id} does not exist!`
          );
          continue;
        }

        if (!(workflow.name in stateMap)) {
          // workflow does not exist in state map
          core.info(
            `unable to set story ${story.id} state: the workflow ${workflow.name} is not defined in the to-state property`
          );
          continue;
        }

        const workflowStateId = getWorkflowStateId(
          workflow,
          stateMap[workflow.name]
        );
        if (workflowStateId === 0) {
          // workflow state not found
          core.info(
            `unable to set story ${story.id} state: the workflow state ${
              stateMap[workflow.name]
            } does not exist in ${workflow.name}`
          );
          continue;
        }

        if (workflowStateId === story.workflow_state_id) {
          // we can skip this, since the story is already in this state
          core.debug(`skipped ${story.id}: is already in ${workflowStateId}`);
          continue;
        }

        core.debug(`setting story ${story.id} state to ${workflowStateId}`);
        await setStoryState(shortcutToken, story.id, workflowStateId);
        core.debug(`set story ${story.id} state to ${workflowStateId}`);
      }
    } catch (e) {
      core.info(e);
      continue;
    }
  }
}

module.exports = { main, getPullRequestsFromRelease };
