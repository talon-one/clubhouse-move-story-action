const lib = require('./lib.js');
const core = require('@actions/core');
const github = require('@actions/github');

if (github.context.payload.release === undefined || github.context.payload.release === null) {
    core.error('github.context.payload.release is not defined, did this action run on release published?');
    return;
}

const githubToken = core.getInput('github-token', { required: true });
const shortcutToken = core.getInput('clubhouse-token', { required: true });
const toState = core.getInput('to-state', { required: true });
const prExpression = core.getInput('pr-regex', { required: true });

const stateMap = JSON.parse(toState);

if (typeof(stateMap) !== 'object' || Object.prototype.toString.call(stateMap) !== '[object Object]') {
    core.error('to-state is not an JSON object');
    return;
}

const octokit = github.getOctokit(githubToken);

async function run() {
    await lib.main(core,
        github.context.payload.release,
        github.context.repo.owner,
        github.context.repo.repo,
        octokit,
        shortcutToken,
        stateMap,
        new RegExp(prExpression),
    );
}

run();


