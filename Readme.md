# AnonTokyo

高性能事件解释器，支持序列化执行状态。

[分享](https://co78gkis4z.feishu.cn/wiki/TtC5wGocfikMBgkufoocOrSkncf)

## quick start

```sh
pnpm install anon-tokyo
```

```ts
import { AnonTokyoInterpreter, StatementType } from 'anon-tokyo';

const testLang = new AnonTokyoInterpreter({
    builtInFunctions: [
        {
            name: "echo",
            func: (parameters, env) => {
                console.log(`[${env.prefix}] ${parameters.text}`);
            }
        }
    ],
    globalFunctions: [],
});

const executable = testLang.compile([
    {
        type: StatementType.Call,
        builtIn: true,
        functionName: "echo",
        parameters: {
            text: ({ args }) => args.test,
        }
    },
]);

await executable.exec({ test: "hello world" }, { prefix: "test" });
```

## 概念介绍

`builtInFunction` 用 js 实现的内置 AnonTokyo 函数。

`globalFunction` 基于事件实现的 AnonTokyo 函数，可以被其他 AnonTokyo 函数调用。等效于 2.x 的公共事件。

`Interpreter` AnonTokyo 解释器，可以将事件编译为 `Executable` 或者立即执行。

`Executable` 可执行的 AnonTokyo 函数。

`ExecutionContext` 执行上下文，每次执行 Executable 都会生成一个上下文，上下文被设计为可序列化的。

## 指令列表

`AnonTokyo` 内部维护了一套事件指令。如果要执行自定义的事件指令，需要自行进行转换，以下是各指令的定义。

```ts
/** 表达式语句，可以执行一个 JS 表达式 */
export interface ExpressionStatement {
    type: StatementType.Expression;
    expression: Expression;
    /** 是否是 async 的，是则会等待 */
    async?: boolean;
}

/** 调用表达式，可以调用一个函数 */
export interface CallStatement {
    type: StatementType.Call;
    functionName: string;
    /** 调用的参数 */
    parameters: Record<string, Value>;
    /** 是否是内置函数，内置函数和全局函数命名空间独立 */
    builtIn?: boolean;
    async?: boolean;
    save?: boolean;
}

export interface ReturnStatement {
    type: StatementType.Return;
    value?: Value;
}

export interface Branch {
    condition: Expression;
    body: Block;
}

export interface IfStatement {
    type: StatementType.If;
    branches: Branch[];
    otherwise?: Block;
}

export interface SwitchStatement {
    type: StatementType.Switch;
    pattern: Expression;
    branches: Branch[];
    otherwise?: Block;
}

export interface LoopStatement {
    type: StatementType.Loop;
    skipInitialCheck?: boolean;
    initializer?: Expression;
    condition?: Expression;
    iterator?: Expression;
    label?: string;
    body: Block;
}

export interface BreakStatement {
    type: StatementType.Break;
    /** 标签跳转，可以跳转到对应的 LoopStatement */
    label?: string;
}

export interface ContinueStatement {
    type: StatementType.Continue;
}

export interface ExitStatement {
    type: StatementType.Exit;
}
```

## 表达式

表达式(`Expression`)是事件调用的基本单位，它是一个 JS 函数。实际执行的时候会传入相关上下文：

```ts
export interface Scope {
    /** 当前 AnonTokyo 函数的实际参数 */
    args: Record<string, any>;
    /** 当前 AnonTokyo 函数的局部变量 */
    local: Record<string, any>;
    /** 整个调用的环境参数 */
    env: Record<string, any>;
}
```

## API

```ts
class AnonTokyoInterpreter {
    /**
     * 将指令编译为可执行的类
     * @param script
     * @returns 
     */
    compile(script: Statement[]): AnonTokyoExecutable


    /**
     * 直接执行一组指令
     * @param script 指令数组
     * @param parameters 参数
     * @param env 环境
     * @returns 
     */
    exec(script: Statement[], parameters: Record<string, any>, env: Record<string, any>): Promise<unknown>
}
```

```ts
export class AnonTokyoExecutable {

    execNode(id: number, scope: Scope): OP | Promise<OP>

    async exec(parameters: Record<string, any>, env: Record<string, any>): Promise<unknown>
}
```
