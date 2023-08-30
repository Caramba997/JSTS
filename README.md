# JSTS - JavaScript Testability Score
This little CLI tool allows for assessing the testability of JS and TS files. It is based on the results of a master's thesis. It uses static code analysis to calculate metrics for files and implements a scoring system based on reference values for the metrics derived from the results of the thesis.

The tool outputs a score between 0 and 100 for each analyzed file, where a higher score means the file is more testable. It can additionally output scores and values for the computed code metrics.

## Installation
You can install the tool in your project via NPM

```
npm i js-testability-score
```

## Usage
Verify the installation by running the following command in your project directory
```
npx jsts --version
```
To get help run
```
npx jsts --help
```
The tool expects a path to a directory in which it should search for files to analyze. The path can be relative to your project directory or absolute.

Example of a relative path
```
npx jsts dir/subdir
```

Example of an absolute path
```
npx jsts C:/dir/project
```

To scan your whole project directory, use
```
npx jsts /
```

By default, the console output only contains scores for the analyzed files. You can additionally output scores for the computed metrics and their actual values by adding `--metrics`. Make sure your console's width is sufficient to display the data.

## Supported file types
> js, ts, cjs, mjs, es6, jsx, tsx, es
