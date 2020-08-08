/**
 * cancel?: string - Rejection message.
 */
export interface TMTask {
  funcName: string;
  args: any[];
  cancel?: string;
}

export abstract class TMTaskQueue {
  protected _lastPromise: Promise<any> = Promise.resolve(true);
  protected _pendingTasks = new Set<TMTask>();
  _debug = false;

  get tasksPanding() { return (this._pendingTasks.size > 0); }

  protected enqueueTask(funcName: string, args = []): Promise<any> {
    if (this._debug) { console.log(this.constructor.name + '.enqueueTask:\n  funcName:', funcName, '\n  args:', args); }
    let task = <TMTask>{ funcName, args };
    this._pendingTasks.add(task);
    let newPromise = this._lastPromise.then(_ => {
      if (task.cancel) {
        this._pendingTasks.delete(task);
        return Promise.reject(task.cancel);
      }
      return this[funcName](...args).then(_ => { this.taskComplete(task, _); return _; });
    });
    this._lastPromise = newPromise;
    return newPromise;
  }

  protected tasksPendingByFunc(funcNames: string | string[]) {
    if (!Array.isArray(funcNames)) { funcNames = [funcNames]; }
    return Array.from(this._pendingTasks).some(task => funcNames.indexOf(task.funcName) > -1);
  }

  protected cancelTask(task: TMTask, rejectionMsg = 'Canceled') {
    task.cancel = rejectionMsg;
    if (this._debug) { console.log(this.constructor.name + '.cancelTask:\n  Task canceled:', task); }
  }

  protected cancelTasksByFuncs(funcNames: string | string[], rejectionMsg = 'Canceled') {
    if (!Array.isArray(funcNames)) { funcNames = [funcNames]; }
    Array.from(this._pendingTasks).forEach(task => {
      if ((funcNames[0] == 'ALL') || (funcNames.indexOf(task.funcName) > -1)) {
        this.cancelTask(task, rejectionMsg);
      }
    });
  }

  protected taskComplete(task: TMTask, resolvedValue: any) {
    this._pendingTasks.delete(task);
    if (this._pendingTasks.size == 0) {
      if (this._debug) { console.log(this.constructor.name + '.taskComplete:\n  Last promise resolved:\n  task:', task, '\n  resolved value:', resolvedValue); }
    } else {
      if (this._debug) { console.log(this.constructor.name + '.taskComplete:\n  Promise resolved:\n  task:', task, '\n  resolved value:', resolvedValue); }
    }
  }
}
