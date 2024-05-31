# AnonTokyo

高性能事件解释器，支持序列化执行状态。

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
