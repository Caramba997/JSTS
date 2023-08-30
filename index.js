#! /usr/bin/env node

const chalk = require('chalk');
const { Table } = require('console-table-printer');
const fs = require('fs');
const path = require('path');
const Metrics = require('./metrics.js');
const appRoot = require('app-root-path');
const calcScores = require('./scores.js');

const log = console.log;

function getCliArg(arg) {
  if (arg === 'dir') {
    return process.argv.length > 2 && !/^[-]{1,2}.*$/.test(process.argv[2]) ? process.argv[2] : false;
  }
  return process.argv.includes(arg);
}

function scores(dir) {
  let metrics;
  try {
    metrics = Metrics.calcForDir(dir);
  }
  catch(e) {
    log(chalk.red('Illegal path'));
    return;
  }
  let scores;
  try {
    scores = calcScores(metrics);
    if (scores.length === 0) {
      log(chalk.red('No files were found'));
      return;
    }
    printScores(scores);
  }
  catch(e) {
    log(chalk.red('Score calculation failed'));
  }
}

function findBasePath(scores) {
  if (scores.length === 1) return '';
  return scores.reduce((prev, curr) => {
    let sim = '';
    for (let i = 0; i < prev.length && i < curr.file.length; i++) {
      if (prev.charAt(i) !== curr.file.charAt(i)) break;
      sim += prev.charAt(i);
    }
    return sim;
  }, scores[0].file);
}

function formatNumber(num) {
  return Math.round(num * 100) / 100;
}

function printScores(scores) {
  log(chalk.yellow.bold.underline('Testability analysis results\n'));
  const basePath = findBasePath(scores);
  const average = scores.reduce((prev, curr) => prev + curr.score, 0) / scores.length;
  const scoreTable = new Table({
    title: 'Scores per file',
    columns: [
      { name: 'FILE', alignment: 'left' },
      { name: 'SCORE', color: 'cyan' }
    ]
  });
  scores.forEach(fileScore => {
    scoreTable.addRow({
      FILE: fileScore.file.replace(basePath, ''),
      SCORE: formatNumber(fileScore.score)
    });
  });
  scoreTable.addRow({
    FILE: '_______',
    SCORE: '_____'
  });
  scoreTable.addRow({
    FILE: 'AVERAGE',
    SCORE: formatNumber(average)
  });
  scoreTable.printTable();
  if (!getCliArg('--metrics')) return;
  const data = JSON.parse(fs.readFileSync(path.resolve(__dirname, './data.json')));
  for (let i = 0; i < data.metrics.length; i += 10) {
    const currentMetrics = data.metrics.slice(i, Math.min(i + 10, data.metrics.length));
    const metricTable = new Table({
      title: `Metric scores (values) per file - ${i / 10 + 1} / ${Math.ceil(data.metrics.length / 10)}`,
      columns: [
        { name: 'FILE', alignment: 'left' },
      ]
    });
    scores.forEach(fileScore => {
      const row = { FILE: fileScore.file.replace(basePath, '') };
      fileScore.metricRanks.forEach(metricRank => {
        if (currentMetrics.includes(metricRank.metric)) row[metricRank.metric] = `${Math.round(100 - metricRank.normalizedRank)} (${Math.round(metricRank.value)})`;
      });
      metricTable.addRow(row);
    });
    metricTable.printTable();
  }
  
}

(function() {

  if (getCliArg('--version')) {
    try {
      const packageJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, './package.json')));
      log(chalk.yellow(`JSTS v${packageJson.version}`));
    }
    catch(e) {
      log(chalk.red('Error reading package data'));
    }
    return;
  }
  
  if (getCliArg('--help')) {
    log(chalk.yellow.bold.underline(`JSTS CLI help`));
    log(chalk.yellow(`${chalk.cyan('npx jsts --version')}: Print version`));
    log(chalk.yellow('To calc testability scores for files in a directory, provide a path to a directory as the first argument.'));
    log(chalk.yellow(`If you installed JSTS in you project and want to scan it, just execute ${chalk.cyan('npx jsts /')}.`));
    log(chalk.yellow(`If you installed JSTS in you project and want to scan a subdirectory, use the relative path (example: ${chalk.cyan('npx jsts dir/subdir')}).`));
    log(chalk.yellow(`You can also use an absolute path (example: ${chalk.cyan('npx jsts C:/dir/project')}).`));
    log(chalk.yellow('Per default, the output contains only the calculated scores (0 - 100) for each file.'));
    log(chalk.yellow('A higher score means better testability.'));
    log(chalk.yellow(`If you want to get more details, you can also output all metric scores and their actual values by adding ${chalk.cyan('--metrics')}.`));
    return;
  }

  const dir = getCliArg('dir');
  if (dir) {
    const path = dir.includes(':') ? `${dir}${dir.charAt(dir.length - 1) === '/' ? '' : '/'}` : `${appRoot.toString().replace(/\\/g, '/')}${dir.charAt(0) === '/' ? '' : '/'}${dir}${dir.charAt(dir.length - 1) === '/' ? '' : '/'}`;
    if (!fs.existsSync(path)) {
      log(chalk.red('Path does not exist'));
      return;
    }
    if (!fs.lstatSync(path).isDirectory()) {
      log(chalk.red('Path is not a directory'));
      return;
    }
    scores(path);
    return;
  }

  log(chalk.red(`Arguments expected. Run ${chalk.cyan('jsts --help')} for more info`));

})();