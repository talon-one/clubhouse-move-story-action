# clubhouse-move-story-action
---
GitHub Action to move Clubhouse Stories to another workflow state after a github release was published.

## Inputs
### `github-token`
GitHub token (to read pull requests)

### `clubhouse-token`
Clubhouse Token (to read and move stories)

### `to-state`
A JSON object that defines where stories should be moved to.

### `pr-regex`
A regex expression to find the pull request number inside the github release body.  
Note that this regular expression runs for every line in the release body.  
Use the capture group `pr` to find the pull request number, the simplest expression would be `#(?<pr>\d+)`.

## Example
```yaml
# this workflow runs when a release was published.
on:
  release:
    types: [published]

name: "release_published"
jobs:
  # Build the binary using GoReleaser
  move-deployed-stories-to-completed:
    runs-on: ubuntu-latest
    steps:
      -
        uses: talon-one/clubhouse-move-story-action@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          clubhouse-token: ${{ secrets.CLUBHOUSE_TOKEN }}
          to-state: |
            {
              "Workflow 1": "Completed",
              "Workflow 2": "Deployed"
            }
          pr-regex: '#(?<pr>\d+)'
```
