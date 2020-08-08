import * as L from './wizard-lib';
import { WizardStage } from './wizard-stage';

export class WizardScenarioNavStrategy implements L.WizNavStrategy {
  private _stages: WizardStage[] = [];
  private _scenario: L.WizScenario = [];
  private _scenarioStages: WizardStage[] = [];
  private _currentStageIndex = 0;
  private _maxReachedStageIndex = 0;
  private _init = false;
  private _unSupportedMethodErr = new Error(`Method is not supported by ${this.constructor.name}`);
  debug = false;

  constructor(private _onInit?: () => void) { }

  //WizNavStrategy compliant class members
  get length() { return this.getScenario().length; }
  get currentStageIndex() { return this._currentStageIndex; }
  get currentStage() { return this.getCurrentStage(); }
  get maxReachedStage() { return this.getMaxReachedStage(); }
  get prevStage() { return this.getStages()[this.currentStageIndex - 1]; }
  get nextStage() { return this.getStages()[this.currentStageIndex + 1]; }
  get hasPrevStage() { return Boolean(this.prevStage) }
  get hasNextStage() { return Boolean(this.nextStage) }
  get isInFirstStage() { return (this.currentStageIndex == 0); }
  get isInLastStage() { return (this.currentStageIndex + 1 == this.length); }
  get prevDisabled() { return !this.currentStage.prevEnabled; }
  get prevEnabled() { return (!this.isInFirstStage && !this.prevDisabled); }
  get nextDisabled() { return !this.currentStage.nextEnabled; }
  get nextEnabled() { return (!this.isInLastStage && !this.nextDisabled); }

  setStages(stages: WizardStage[]): Promise<WizardStage[]> {//currentStage checked in validateStages() in wizard
    return new Promise(resolve => {
      this._stages = stages;
      if (this._init) { this.resetScenario(); }
      resolve(stages);
    });
  }

  getStages() {
    return this._stages;
  }

  getStage(stageId: string) {
    return this.getStages().find(stage => stage.id == stageId);
  }

  hasStage(stageId: string) {
    return this.getStages().some(stage => stage.id == stageId);
  }

  hasStageInCurrentScenario(stageId: string) {
    return (this.getScenario().indexOf(stageId) > -1);
  }

  getFirstStage() {
    return this.getStage(this.getScenario()[0]);
  }

  getLastStage() {
    let s = this.getScenario();
    return this.getStage(s[s.length - 1]);
  }

  isFirstStage(stageId: string) {
    let index = this.getScenario().indexOf(stageId);
    if (index < 0) { throw new Error(`Stage id doesn't exist in current scenario: ` + stageId); }
    return (index == 0);
  }

  isLastStage(stageId: string) {
    let index = this.getScenario().indexOf(stageId);
    if (index < 0) { throw new Error(`Stage id doesn't exist in current scenario: ` + stageId); }
    return (index == (this.length - 1));
  }

  setCurrentStage(stageId: string, opts: L.WizNavOpts = {}): Promise<boolean> {
    return new Promise(resolve => {
      let index = this.getScenario().indexOf(stageId);
      if (index < 0) { throw new Error(`Stage id doesn't exist in current scenario: ` + stageId); }
      if (!opts.allowForward && (index > this.getMaxReachedStageIndex())) {
        throw new Error(`Forward navigation is prohibited: stage id: ` + stageId);
      }
      this._currentStageIndex = index;
      resolve(true);
    });
  }

  setScenario(scenario?: L.WizScenario): Promise<boolean> {
    return new Promise(resolve => {
      this.resetMaxReachedStage();
      let existingStages = this.extractScenario();
      if (!existingStages.length) { throw new Error('Stages must be set before scenario'); }
      if (!scenario) { resolve(Boolean(this.resetScenario())); }
      this.checkDuplicates(scenario);
      let missingStages = scenario.filter(id => (existingStages.indexOf(id) < 0));
      if (missingStages.length) {
        throw new Error('Stages missing from stage list: ' + missingStages.join(','));
      }
      this._setScenario(scenario);
      resolve(true);
    });
  }

  getScenario(): L.WizScenario {
    return this._scenario;
  }

  start(scenario?: L.WizScenario): Promise<boolean> {
    if (this._init) { Promise.resolve(true); }
    return this.setScenario(scenario);
  }

  prev(opts: L.WizNavOpts = {}): Promise<WizardStage | false> {
    return new Promise(resolve => {
      if (this.isInFirstStage) { resolve(false); }
      if (!opts.force && this.prevDisabled) { resolve(false); }
      this._currentStageIndex--;
      resolve(this.currentStage);
    });
  }

  next(opts: L.WizNavOpts = {}): Promise<WizardStage | false> {
    return new Promise(resolve => {
      if (this.isInLastStage) { resolve(false); }
      if (!opts.force && this.nextDisabled) { resolve(false); }
      this._currentStageIndex++;
      resolve(this.currentStage);
    });
  }

  getProgress(to: 'current' | 'maxReached' = 'maxReached') {
    return this._scenarioStages.slice(0, this.getMaxReachedStageIndex() + 1);
  }

  resetMaxReachedStage() {
    this._maxReachedStageIndex = this.currentStageIndex;
  }
  //WizNavStrategy compliant class members

  getCurrentStage() {
    return this.getStageByIndex(this.currentStageIndex);
  }

  getMaxReachedStage() {
    return this.getStageByIndex(this.getMaxReachedStageIndex());
  }

  getMaxReachedStageIndex() {
    this._maxReachedStageIndex = (this._maxReachedStageIndex < this.currentStageIndex) ? this.currentStageIndex : this._maxReachedStageIndex;
    return this._maxReachedStageIndex;
  }

  getStageByIndex(index: number) {
    let id = this.getScenario()[index];
    return this.getStage(id);
  }

  private _setScenario(scenario: L.WizScenario) {
    if (this.debug) { console.log('WizardScenarioNavStrategy._setScenario:\n  scenario:', scenario); }
    let stageId = (this.currentStage) ? this.currentStage.id : null;
    this._scenario = scenario;
    this.setScenarioStages();
    this._currentStageIndex = (stageId) ? scenario.indexOf(stageId) : 0;
    if (this._init) return;
    this._init = true;
    if (typeof this._onInit == 'function') { this._onInit(); }
  }

  private setScenarioStages() {
    let stages = this.getStages();
    this._scenarioStages = this.getScenario().map(id => stages.find(stage => stage.id == id));
    if (this.debug) { console.log('WizardScenarioNavStrategy.setScenarioStages:\n  _scenarioStages:', this._scenarioStages); }
  }

  private resetScenario(): L.WizScenario {
    if (this.getStages()) {
      this._setScenario(this.extractScenario());
    } else {
      this._scenario = null;
    }
    return this.getScenario();
  }

  private extractScenario(st = this.getStages()) {
    return st.map(stage => stage.id);
  }

  private checkDuplicates(scenario: L.WizScenario) {
    if (scenario.length > (new Set(scenario)).size) {
      throw new TypeError(`Duplicate stages in scenario: ` + scenario.join());
    }
  }
}
