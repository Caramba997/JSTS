const fs = require('fs');

function calcRank(allValues, value) {
  const index = allValues.indexOf(value);
  if (index !== -1) return index + 1;
  for (let i = 0; i < allValues.length; i++) {
    if (allValues[i] > value) return i;
  }
  return allValues.length;
}

function calcScores(metrics) {
  // Read static metric data
  const data = JSON.parse(fs.readFileSync('./data.json'));
  const relevantMetrics = new Set(data.metrics);
  const ranks = data.values;
  const moduleRanks = data.moduleRanks;
  // Calc ranks for metrics
  const levels = {};
  Object.entries(metrics).forEach(([file, fileMetrics]) => {
    levels[file] = {
      ranks: []
    };
    Object.entries(fileMetrics).forEach(([metric, value]) => {
      if (value instanceof Object) {
        Object.entries(value).forEach(([aggr, aggrValue]) => {
          if (aggr === 'values' || !relevantMetrics.has(`${metric}_${aggr}`)) return;
          levels[file].ranks.push({
            metric: `${metric}_${aggr}`,
            value: aggrValue,
            rank: calcRank(ranks[metric][aggr], aggrValue),
            normalizedRank: (ranks[metric][aggr].indexOf(aggrValue) + 1) / ranks[metric][aggr].length * 100
          });
        });
      }
      else {
        if (!relevantMetrics.has(metric)) return;
        levels[file].ranks.push({
          metric: metric,
          value: value,
          rank: calcRank(ranks[metric], value),
          normalizedRank: (ranks[metric].indexOf(value) + 1) / ranks[metric].length * 100
        });
      }
    });
  });
  // Accumulate ranks for modules
  Object.values(levels).forEach(fileData => {
    let rankAcc = 0,
        total = 0;
    fileData.ranks.forEach(rankInfo => {
      rankAcc += rankInfo.normalizedRank;
      total++;
    });
    fileData.accumulatedRank = rankAcc / total;
  });
  // Calc final ranks for modules
  const maxRank = moduleRanks[moduleRanks.length - 1];
  Object.values(levels).forEach(fileData => {
    fileData.rank = calcRank(moduleRanks, fileData.accumulatedRank);
    fileData.relativeRank = 100 - fileData.accumulatedRank / maxRank * 100;
    fileData.score = 100 - fileData.accumulatedRank;
  });
  // Create list of modules sorted by rank
  const list = [];
  Object.entries(levels).forEach(([file, fileData]) => {
    list.push({
      file: file,
      rank: fileData.rank,
      metricRanks: fileData.ranks,
      accumulatedRank: fileData.accumulatedRank,
      relativeRank: fileData.relativeRank,
      score: fileData.score
    });
  });
  list.sort((a, b) => b.rank - a.rank);
  return list;
}

module.exports = calcScores;