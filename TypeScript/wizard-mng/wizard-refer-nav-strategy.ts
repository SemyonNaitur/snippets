import * as L from './wizard-lib';
import { WizardStage } from './wizard-stage';

export class WizardReferNavStrategy implements L.WizNavStrategy {
  private _stages: WizardStage[];
  private _currentStage: WizardStage;
  private _history: WizardStage[] = [];
  private _init = false;
  private _unSupportedMethodErr = new Error(`Method is not supported by ${this.constructor.name}`);
  debug = false;

  constructor(private _onInit?: () => void) { }

  //WizNavStrategy compliant class members
  get length(): any { throw this._unSupportedMethodErr; }
  get currentStageIndex() { return this._history.length; }
  get currentStage() { return this._currentStage; }
  get maxReachedStage(): any { throw this._unSupportedMethodErr; }
  get prevStage() { return this._history[0]; }
  get nextStage() { return this._currentStage.nextStage; }
  get hasPrevStage() { return Boolean(this.prevStage) }
  get hasNextStage() { return Boolean(this.nextStage) }
  get isInFirstStage() { return (this.currentStageIndex == 0); }
  get isInLastStage() { return !Boolean(this.nextStage); }
  get prevDisabled() { return !this.currentStage.prevEnabled; }
  get prevEnabled() { return (!this.isInFirstStage && !this.prevDisabled); }
  get nextDisabled() { return !this.currentStage.nextEnabled; }
  get nextEnabled() { return !this.nextDisabled; }

  setStages(stages: WizardStage[]): Promise<WizardStage[]> {
    return new Promise(resolve => {
      this._stages = stages;
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

  hasStageInCurrentScenario(stageId: string): any { throw this._unSupportedMethodErr; }

  getFirstStage() {
    let h = this._history;
    return h[h.length - 1];
  }

  getLastStage(): any { throw this._unSupportedMethodErr; }

  isFirstStage(stageId: string) {
    let index = this.getScenario().indexOf(stageId);
    if (index < 0) {
      throw new Error(`Stage id doesn't exist in current scenario: ` + stageId)
    };
    return (index == 0);
  }

  isLastStage(stageId: string): any { throw this._unSupportedMethodErr; }

  setCurrentStage(stageId: string, opts: L.WizNavOpts): Promise<boolean> {
    return new Promise(resolve => {
      resolve(true);
    });
  }

  setScenario(): any { throw this._unSupportedMethodErr; }
  getScenario(): any { throw this._unSupportedMethodErr; }

  start(stageId: string): Promise<WizardStage> {
    return new Promise(resolve => {
      let stages = this.getStages();
      if (!stages.length) { throw new Error('Stages not set'); }
      let stage = stages.find(stage => stage.id == stageId);
      if (!stage) { throw new Error('Stage id is not in list: ' + stageId); }
      this._currentStage = stage;
      if (!this._init) {
        this._init = true;
        if (typeof this._onInit == 'function') { this._onInit(); }
      }
      resolve(stage);
    });
  }

  prev(): Promise<WizardStage | false> {
    return new Promise(resolve => {
      if (!this.prevEnabled) { resolve(false); }
      this._currentStage = this.historyPop();
      resolve(this._currentStage);
    });
  }

  next(): Promise<WizardStage | false> {
    return new Promise(resolve => {
      if (!this.nextEnabled) { resolve(false); }
      this.historyPush(this._currentStage);
      this._currentStage = this.nextStage;
      resolve(this._currentStage);
    });
  }

  getProgress() {
    let p = this._history.slice(0).reverse();
    p.push(this.currentStage);
    return p;
  }

  resetMaxReachedStage(): any { throw this._unSupportedMethodErr; }
  //WizNavStrategy compliant class members

  historyPush(stage: WizardStage) {
    this._history.unshift(stage);
  }

  historyPop(): WizardStage {
    return this._history.shift();
  }
}
