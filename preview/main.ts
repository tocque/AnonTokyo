import { AnonTokyoInterpreter } from "../src/interpreter";
import { StatementType } from "../src/type";

const testLang = new AnonTokyoInterpreter({
    builtInFunctions: [
        {
            name: "echo",
            func: (parameters, env) => {
                console.log(`[${env.prefix}] ${parameters.text}`);
            }
        }
    ],
    globalFunctions: [
        ["echo", [
            {
                type: StatementType.Call,
                builtIn: true,
                functionName: "echo",
                parameters: {
                    text: ({ args }) => `echo: ${args.text}`,
                }
            },
        ]]
    ],
});

console.time("compile");

const executable = testLang.compile([
    {
        type: StatementType.Call,
        builtIn: false,
        functionName: "echo",
        parameters: {
            text: ({ args }) => args.test,
        }
    },
    {
        type: StatementType.Expression,
        expression: ({ local }) => local.k = 0,
    },
    {
        type: StatementType.Loop,
        initializer: ({ local }) => local.i = 0,
        condition: ({ local }) => local.i < 5000000,
        iterator: ({ local }) => local.i++,
        body: [
            {
                type: StatementType.If,
                branches: [
                    {
                        condition: ({ local }) => local.i % 13 === 0,
                        body: [
                            {
                                type: StatementType.Expression,
                                expression: ({ local }) => local.k += local.i * local.i,
                            }
                        ]
                    }
                ],
                otherwise: [
                    {
                        type: StatementType.Switch,
                        pattern: ({ local }) => local.k % 10,
                        branches: [
                            {
                                condition: () => 5,
                                body: [
                                    {
                                        type: StatementType.Expression,
                                        expression: ({ local }) => local.k -= local.i,
                                    },
                                    {
                                        type: StatementType.Break,
                                    }
                                ]
                            }
                        ]
                    }
                ]
            }
        ]
    },
    {
        type: StatementType.Call,
        builtIn: true,
        functionName: "echo",
        parameters: {
            text: ({ local }) => `echo: ${local.k}`,
        }
    },
]);
console.timeEnd("compile");

console.time("run");

await executable.exec({ test: 1 }, { prefix: "test" });

console.timeEnd("run");
