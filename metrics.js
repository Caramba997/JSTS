const escomplex = require('typhonjs-escomplex');
const Parser = require('@babel/parser');
const walk = require('estree-walker').walk;
const path = require('path');
const fs = require('fs');

class Metrics {

  static #fileTypes = ['js', 'ts', 'cjs', 'mjs', 'es6', 'jsx', 'tsx', 'es', 'gs'];
  static #tsTypes = ['ts', 'tsx'];
  static #jsxTypes = ['jsx'];
  static #testRegex = new RegExp([
    '(?<!crea|execu)test',
    'spec',
    'cypress'
  ].join('|'));
  static #skipFilesRegex = new RegExp([
    'babelrc',
    'eslintrc',
    'prettierrc',
    'commitlintrc',
    'Gruntfile',
    '\\.min',
    'fixture',
    '\\.conf'
  ].join('|'));

  /**
   * Calc the sum of the given numbers
   * @param {number[]} arr Array of numbers
   * @returns Sum
   */
  static total(arr) {
    if (arr.length === 0) return null;
    return arr.reduce((prev, curr) => prev + curr, 0);
  }

  /**
   * Calc the average of the given numbers
   * @param {number[]} arr Array of numbers
   * @returns Average
   */
  static average(arr) {
    if (arr.length === 0) return null;
    return arr.reduce((prev, curr) => prev + curr, 0) / arr.length;
  }

  /**
   * Calc the median of the given numbers
   * @param {number[]} arr Array of numbers
   * @returns Median
   */
  static median(arr) {
    if (arr.length === 0) return null;
    const sorted = [...arr].sort((a, b) => a - b);
    return sorted.length % 2 === 1 ? sorted[Math.floor(sorted.length / 2)] : (sorted[sorted.length / 2- 1] + sorted[sorted.length / 2]) / 2;
  }

  /**
   * Find the maximum of the given numbers
   * @param {number[]} arr Array of numbers
   * @returns Maximum
   */
  static max(arr) {
    if (arr.length === 0) return null;
    return Math.max(...arr);
  }

  /**
   * Find the minimum of the given numbers
   * @param {number[]} arr Array of numbers
   * @returns Minimum
   */
  static min(arr) {
    if (arr.length === 0) return null;
    return Math.min(...arr);
  }

  /**
   * Count the number of lines of comments in the given code
   * @param {string} code Code
   * @returns Number of comments
   */
  static comments(code) {
    const regex = /\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*$/gm;
    const matches = code.match(regex);
    if (matches === null) return 0;
    let total = 0;
    matches.forEach((match) => {
      const lines = match.split(/\r?\n/).filter(line => line !== '');
      total += lines.length;
    });
    return total;
  }

  /**
   * Calc the nesting depth of a code snippet
   * @param {string} tree AST
   * @returns Depth as number
   */
  static depth(tree) {
    const blockTypes = ['BlockStatement', 'ClassBody', 'FunctionBody'];
    let currentLevel = 0,
        maxLevel = 0;
    walk(tree, {
      enter (node) {
        if (blockTypes.includes(node.type)) currentLevel++;
        maxLevel = Math.max(currentLevel, maxLevel);
      },
      leave (node) {
        if (blockTypes.includes(node.type)) currentLevel--;
      }
    });
    return maxLevel;
  }

  /**
   * Count the number of method calls in a code snippet
   * @param {string} tree AST
   * @returns Depth as number
   */
  static calls(tree) {
    const callType = 'CallExpression';
    let calls = 0;
    walk(tree, {
      enter (node) {
        if (node.type === callType) calls++;
      }
    });
    return calls;
  }

  /**
   * Executes a given function for each occurence of a function in the AST
   * @param {string} code Code
   * @param {function} method Function to call for each found occurence
   * @returns Array of results
   */
  static eachFunction(tree, method) {
    const functionTypes = ['FunctionExpression', 'ArrowFunctionExpression'];
    const result = [];
    walk(tree, {
      enter (node) {
        if (functionTypes.includes(node.type)) {
          result.push(method(node));
        }
      }
    });
    return result;
  }

  /**
   * Calculates aggregate values
   * @param {number[]} arr Array of values
   * @returns Object with aggregate values
   */
  static aggregatesFromArr(arr) {
    const result = {};
    result.total = this.total(arr);
    result.avg = this.average(arr);
    result.med = this.median(arr);
    result.min = this.min(arr);
    result.max = this.max(arr);
    result.values = arr;
    return result;
  }

  /**
   * Calc how many imports a file has and how often it is imported by other modules
   * @param {string[]} filePaths File paths
   * @returns Object containing arrays for import and export values
   */
  static importsPerModule(filePaths, metrics) {
    filePaths.forEach((path) => {
      const code = fs.readFileSync(path, { encoding: 'utf8', flag: 'r' }).toString();
      try {
        const tree = this.parse(code, path);
        walk(tree, {
          enter(node) {
            let importPath = null;
            if (node.type === 'ImportDeclaration') {
              importPath = node.source.value;
            }
            else if (node.type === 'CallExpression' && (node.callee.name === 'require' || node.callee.name === 'import') && node.arguments[0]) {
              importPath = node.arguments[0].value;
            }
            if (importPath != null) {
              metrics[path].ecM++;
              const name = importPath.split('/').at(-1);
              Object.keys(metrics).forEach((tempPath) => {
                if (tempPath.split('/').at(-1).includes(name)) metrics[tempPath].acM++;
              });
            }
          }
        });
      }
      catch (e) {
        console.error('Error in generating coupling stats for file ' + path);
      }
    });
  }

  /**
   * Create a complexity report for the given code
   * @param {string} tree AST
   * @returns Complexity report
   */
  static complexity(tree) {
    const result = escomplex.analyzeModuleAST(tree);
    return result;
  }

  /**
   * Returns all paths to files with JS/TS extension
   * @param {string} dirPath Path to project directory, needs to end with '/'
   * @param {boolean} testDir True, if test directory
   * @returns Array containing file paths
   */
  static getFilePaths(dirPath) {
    const paths = [];
    const dirs = fs.readdirSync(dirPath, {withFileTypes: true});
    for (let i = 0; i < dirs.length; i++) {
      if (dirs[i].isDirectory()) {
        if (dirs[i].name.includes('node_modules') || dirs[i].name.includes('instrumented') || dirs[i].name.includes('bower_components') || dirs[i].name.includes('fixture')) continue;
        if (this.#testRegex.test(dirs[i].name.toLowerCase())) continue;
        paths.push(...this.getFilePaths(`${dirPath}${dirs[i].name}/`));
      }
      else if (this.#fileTypes.includes(path.extname(dirs[i].name).replace(/\./, ''))) {
        if (dirs[i].name.match(this.#skipFilesRegex) !== null) continue;
        paths.push(`${dirPath}${dirs[i].name}`);
      }
    }
    return paths;
  }

  /**
   * Create AST from source code
   * @param {string} code Source code
   * @param {string} path File path, needed to use parsing options depending on file type
   * @returns AST
   */
  static parse(code, path) {
    let pathArr = path.split('/');
    const filename = pathArr[pathArr.length - 1];
    pathArr = filename.split('.');
    const type = (this.#tsTypes.includes(pathArr[pathArr.length - 1])) ? 'ts' : (this.#jsxTypes.includes(pathArr[pathArr.length - 1])) ? 'jsx' : 'js';
    const options = {
      allowImportExportEverywhere: true,
      allowAwaitOutsideFunction: true,
      allowNewTargetOutsideFunction: true,
      allowReturnOutsideFunction: true,
      allowSuperOutsideMethod: true,
      allowUndeclaredExports: true,
      attachComment: true,
      errorRecovery: true,
      sourceFilename: filename,
      sourceType: 'unambiguous',
      plugins: [
        'estree',
        'decorators',
        'asyncDoExpressions',
        'decimal',
        'decoratorAutoAccessors',
        'destructuringPrivate',
        'doExpressions',
        'explicitResourceManagement',
        'exportDefaultFrom',
        'functionBind',
        'functionSent',
        'importAssertions',
        'importReflection',
        'moduleBlocks',
        'partialApplication',
        'recordAndTuple',
        'regexpUnicodeSets',
        'throwExpressions'
      ]
    }
    let isTs = false;
    if (type === 'ts') {
      options.plugins.push([
        'typescript',
        {
          'dts': true
        }
      ]);
      isTs = true;
    }
    else if (type === 'jsx') {
      options.plugins.push('jsx');
    }
    try {
      const parsed = Parser.parse(code, options);
      return parsed;
    }
    catch (e) {
      if (e.reasonCode && e.reasonCode === 'MissingOneOfPlugins') {
        console.log('Parsing failed with reason missing plugin, retrying with jsx plugin');
        options.plugins.push('jsx');
        const parsed = Parser.parse(code, options);
        return parsed;
      }
      else if  (e.reasonCode && e.reasonCode === 'UnexpectedToken') {
        if (isTs) {
          console.log('Parsing failed with reason unexpected token, retrying with jsx plugin because is typescript');
          options.plugins.push('jsx');
        }
        else {
          console.log('Parsing failed with reason unexpected token, retrying with flow plugin');
          options.plugins.push('flow');
        }
        const parsed = Parser.parse(code, options);
        return parsed;
      }
      throw e;
    }
  }
  
  /**
   * Calc complexity metrics for the given file paths
   * @param {string} dirPath Dir path
   * @returns Complexity metrics
   */
  static calcForDir(dirPath) {
    const paths = this.getFilePaths(dirPath);
    const result = {};
    for (let i = 0; i < paths.length; i++) {
      const values = {
        noF: 0,
        locF: [],
        loclF: [],
        ccF: [],
        hbugsF: [],
        hdiffF: [],
        heffortF: [],
        hlengthF: [],
        htimeF: [],
        hvocabF: [],
        hvolF: [],
        paramF: [],
        dpF: [],
        ecM: 0,
        acM: 0
      };
      result[paths[i]] = values;
      const metrics = result[paths[i]];
      const code = fs.readFileSync(paths[i], { encoding: 'utf8', flag: 'r' }).toString();
      try{
        const tree = this.parse(code, paths[i]);
        const complex = this.complexity(tree);
        metrics.locM = complex.aggregate.sloc.physical;
        metrics.loccM = this.comments(code);
        metrics.loclM = complex.aggregate.sloc.logical;
        metrics.ccM = complex.aggregate.cyclomatic;
        metrics.hbugsM = complex.aggregate.halstead.bugs;
        metrics.hdiffM = complex.aggregate.halstead.difficulty;
        metrics.heffortM = complex.aggregate.halstead.effort;
        metrics.hlengthM = complex.aggregate.halstead.length;
        metrics.htimeM = complex.aggregate.halstead.time;
        metrics.hvocabM = complex.aggregate.halstead.vocabulary;
        metrics.hvolM = complex.aggregate.halstead.volume;
        metrics.paramM = complex.aggregate.paramCount;
        metrics.maintainM = complex.maintainability;
        for (let k = 0; k < complex.methods.length; k++) {
          const method = complex.methods[k];
          metrics.noF += 1;
          metrics.locF.push(method.sloc.physical);
          metrics.loclF.push(method.sloc.logical);
          metrics.ccF.push(method.cyclomatic);
          metrics.hbugsF.push(method.halstead.bugs);
          metrics.hdiffF.push(method.halstead.difficulty);
          metrics.heffortF.push(method.halstead.effort);
          metrics.hlengthF.push(method.halstead.length);
          metrics.htimeF.push(method.halstead.time);
          metrics.hvocabF.push(method.halstead.vocabulary);
          metrics.hvolF.push(method.halstead.volume);
          metrics.paramF.push(method.paramCount);
        }
        metrics.nofM = complex.methods.length;
        metrics.dpM = this.depth(tree);
        metrics.dpF = this.eachFunction(tree, this.depth);
        metrics.mcM = this.calls(tree);
        Object.entries(metrics).forEach(([key, value]) => {
          if (Array.isArray(value) && value.length > 0) metrics[key] = this.aggregatesFromArr(value);
        });
      }
      catch(e) {
        console.error('Error in generating complexity report for file ' + paths[i]);
        continue;
      }
    }
    try {
      this.importsPerModule(paths, result);
    }
    catch(e) {
      console.error('Error in generating coupling metrics');
    }
    return result;
  }

}

module.exports = Metrics;