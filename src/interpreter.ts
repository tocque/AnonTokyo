import { compile } from './compile';
import { Block, OPType, ExecutionNode, Scope, Expression, Statement } from './type';

export interface BuiltInFunction {
    name: string;
    save?: boolean;
    func: (parameters: Record<string, any>, env: Record<string, any>) => any;
}

export interface LanguageFeature {
    builtInFunctions: BuiltInFunction[];
    globalFunctions: [name: string, Block][];
}

const EXIT_SIGNAL = Symbol("EXIT");

export class AnonTokyoIterator {

    constructor(
        private readonly executable: AnonTokyoExecutable,
        private readonly parameters: Record<string, any>,
        private readonly executionContext: AnonTokyoExecutionContext,
    ) {

    }

    private context: Record<string, any> = {};
    private current = 0;
    private returnValue: any = undefined;

    async next() {
        const op = await this.executable.execNode(this.current, {
            local: this.context,
            args: this.parameters,
            env: this.executionContext.env,
        });
        const [type] = op;
        switch (type) {
            case OPType.Move: {
                const [, next] = op;
                this.current = next;
                break;
            }
            case OPType.Call: {
                const [, name, parameters, next] = op;
                this.current = next;
                await this.executionContext.callByName(name, parameters);
                break;
            }
            case OPType.Return: {
                const [, returnValue] = op;
                this.current = -1;
                this.returnValue = returnValue;
                break;
            }
            case OPType.Exit: {
                this.current = -2;
            }
        }
    }

    async run() {
        while (this.current >= 0) {
            await this.next();
        }
        if (this.current === -1) {
            return this.returnValue;
        } else if (this.current === -2) {
            return EXIT_SIGNAL;
        }
    }
}

/**
 * 执行上下文，每次执行 Executable 都会生成一个上下文，上下文被设计为可序列化的。
 */
export class AnonTokyoExecutionContext {

    private callStack: AnonTokyoIterator[] = [];

    constructor(
        public readonly env: Record<string, any>,
        private readonly interpreter: AnonTokyoInterpreter,
    ) {

    }

    callByName(name: string, parameters: Record<string, any>) {
        const executable = this.interpreter.getGlobalFunction(name);
        return this.call(executable, parameters);
    }

    async call(executable: AnonTokyoExecutable, parameters: Record<string, any>) {
        const iterator = new AnonTokyoIterator(executable, parameters, this);
        this.callStack.push(iterator);
        const res = await iterator.run();
        this.callStack.pop();
        return res;
    }

    dump() {

    }
}

/**
 * 可执行的函数
 */
export class AnonTokyoExecutable {

    constructor(
        private program: ExecutionNode[],
        private readonly interpreter: AnonTokyoInterpreter
    ) {

    }

    execNode(id: number, scope: Scope) {
        if (id >= this.program.length) throw id;
        return this.program[id](scope);
    }

    /**
     * 执行函数
     * @param parameters 参数
     * @param env 环境变量，调用链中的所有函数均可见
     * @returns 
     */
    async exec(parameters: Record<string, any>, env: Record<string, any>): Promise<unknown> {
        const context = new AnonTokyoExecutionContext(env, this.interpreter);
        return context.call(this, parameters);
    }
}

/**
 * 解释器，可以将事件编译为 `Executable` 或者立即执行
 */
export class AnonTokyoInterpreter {

    private readonly builtInFunctionMap: Map<string, BuiltInFunction>;
    private readonly globalFunctionMap: Map<string, AnonTokyoExecutable>;

    constructor(lang: LanguageFeature) {
        const { builtInFunctions, globalFunctions } = lang;
        this.builtInFunctionMap = new Map(builtInFunctions.map((e) => [e.name, e]));
        this.globalFunctionMap = this.loadGlobalFunctions(globalFunctions);
    }

    loadGlobalFunctions(globalFunctions: [name: string, Block][]) {
        return new Map<string, AnonTokyoExecutable>(globalFunctions.map(([name, script]) => [name, this.compile(script)]));
    }

    getGlobalFunction(name: string) {
        const executable = this.globalFunctionMap.get(name);
        if (!executable) {
            throw `missing global function "${name}"`;
        }
        return executable;
    }

    getBuiltInFunction(name: string) {
        const func = this.builtInFunctionMap.get(name);
        if (!func) {
            throw `missing built-in function "${name}"`;
        }
        return func;
    }

    execBuiltInFunction(name: string, parameters: Record<string, Expression>, env: Record<string, any>) {
        const func = this.builtInFunctionMap.get(name);
        if (!func) {
            throw `missing built-in function "${name}"`;
        }
        return func.func(parameters, env);
    }

    /**
     * 将指令编译为可执行的类
     * @param script 
     * @returns 
     */
    compile(script: Statement[]): AnonTokyoExecutable {
        const program = compile(script, (name) => {
            return this.getBuiltInFunction(name);
        });
        return new AnonTokyoExecutable(program, this);
    }

    /**
     * 直接执行一组指令
     * @param script 指令数组
     * @param parameters 参数
     * @param env 环境
     * @returns 
     */
    exec(script: Statement[], parameters: Record<string, any>, env: Record<string, any>) {
        const executable = this.compile(script);
        return executable.exec(parameters, env);
    }
}
