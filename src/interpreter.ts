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

export class AnonTokyoExecutionContext {

    private callStack: AnonTokyoIterator[] = [];

    constructor(
        public readonly env: Record<string, any>,
        private readonly interpreter: AnonTokyoInterpreter,
    ) {

    }

    callByName(name: string, parameters: Record<string, any>) {
        const executable = this.interpreter.findGlobalFunction(name);
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

    async exec(parameters: Record<string, any>, env: Record<string, any>): Promise<unknown> {
        const context = new AnonTokyoExecutionContext(env, this.interpreter);
        return context.call(this, parameters);
    }
}

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

    findGlobalFunction(name: string) {
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

    compile(script: Statement[]): AnonTokyoExecutable {
        const program = compile(script, (name) => {
            return this.getBuiltInFunction(name);
        });
        return new AnonTokyoExecutable(program, this);
    }

    exec(script: Statement[], parameters: Record<string, any>, env: Record<string, any>) {
        const executable = this.compile(script);
        return executable.exec(parameters, env);
    }
}
