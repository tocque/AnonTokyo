import { isFunction, mapValues } from "lodash-es";
import { BuiltInFunction } from "./interpreter";
import { splitArray } from "./utils";
import { Block, BlockFlowNode, FlowNode, Statement, FlowNodeType, StatementType, LoopFlowNode, LoopInitializerFlowNode, ReturnFlowNode, Expression, ExecutionNode, OPType, Scope } from "./type";

const AsyncFunction = async function () { }.constructor;

export const flowAnalyzePass = (program: Block): BlockFlowNode => {
    const flowNodeMap: FlowNode[] = [];
    const addNode = <T extends FlowNode>(node: T) => {
        node.id = flowNodeMap.length;
        flowNodeMap.push(node);
    }
    const toBlockFlowNode = (statements: Statement[], successor: FlowNode): BlockFlowNode => {
        let last = successor;
        const nodes = statements.toReversed().map((statement) => {
            last = toFlowNode(statement, last);
            return last;
        }).toReversed();
        return {
            id: -1,
            type: FlowNodeType.Block,
            nodes,
            next: successor,
            mergable: nodes.every((node) => node.mergable)
        };
    }
    const labelMap = new Map<string, FlowNode>();
    const breakableNodeStack: FlowNode[] = [];
    const toFlowNode = (statement: Statement, successor: FlowNode): FlowNode => {
        switch (statement.type) {
            case StatementType.Expression: {
                return {
                    id: -1,
                    type: FlowNodeType.Normal,
                    statement,
                    next: successor,
                    mergable: true,
                };
            }
            case StatementType.Call: {
                if (statement.builtIn) {
                    return {
                        id: -1,
                        type: FlowNodeType.Normal,
                        statement,
                        next: successor,
                        mergable: true,
                    };
                } else {
                    return {
                        id: -1,
                        type: FlowNodeType.ExternCall,
                        statement,
                        next: successor,
                        mergable: false,
                    };
                }
            }
            case StatementType.Return: {
                return {
                    id: -1,
                    type: FlowNodeType.Return,
                    statement,
                    mergable: true,
                };
            }
            case StatementType.If: {
                const branches = statement.branches.map(({ condition, body }) => {
                    return {
                        condition,
                        node: toBlockFlowNode(body, successor),
                    }
                });
                const otherwise = statement.otherwise && toBlockFlowNode(statement.otherwise, successor);
                return {
                    id: -1,
                    type: FlowNodeType.If,
                    statement,
                    branches,
                    otherwise,
                    mergable: branches.every((branch) => branch.node.mergable) && (otherwise?.mergable ?? true),
                    next: successor,
                };
            }
            case StatementType.Switch: {
                const otherwise = statement.otherwise && toBlockFlowNode(statement.otherwise, successor);
                let last = otherwise ?? successor;
                const branches = statement.branches.toReversed().map(({ condition, body }) => {
                    last = toBlockFlowNode(body, last);
                    return {
                        condition,
                        node: toBlockFlowNode(body, last),
                    }
                }).toReversed();
                return {
                    id: -1,
                    type: FlowNodeType.Switch,
                    statement,
                    branches,
                    otherwise,
                    mergable: branches.every((branch) => branch.node.mergable) && (otherwise?.mergable ?? true),
                    next: successor,
                };
            }
            case StatementType.Loop: {
                const loopNode: LoopFlowNode = {
                    id: -1,
                    type: FlowNodeType.Loop,
                    statement,
                    body: toBlockFlowNode([], successor),
                    next: successor,
                    mergable: false,
                }
                if (statement.label) {
                    if (labelMap.has(statement.label)) {
                        throw new Error(`duplicate label ${statement.label}`);
                    }
                    labelMap.set(statement.label, loopNode);
                }
                breakableNodeStack.push(loopNode);
                loopNode.body = toBlockFlowNode(statement.body, loopNode);
                loopNode.mergable = loopNode.body.mergable;
                if (statement.label) {
                    labelMap.delete(statement.label);
                }
                breakableNodeStack.pop();
                if (statement.initializer) {
                    const initializerNode: LoopInitializerFlowNode = {
                        id: -1,
                        type: FlowNodeType.LoopInitializer,
                        main: loopNode,
                        mergable: true,
                    }
                    return initializerNode;
                } else {
                    if (statement.skipInitialCheck) return loopNode.body;
                    else return loopNode;
                }
            }
            case StatementType.Break: {
                if (statement.label) {
                    const to = labelMap.get(statement.label);
                    if (!to) {
                        throw new Error(`undef label ${to}`);
                    }
                    return {
                        id: -1,
                        type: FlowNodeType.Jump,
                        statement,
                        next: to,
                        mergable: true,
                    };
                } else {
                    const to = breakableNodeStack.at(-1);
                    if (!to) {
                        throw new Error(`unexcepted break`);
                    }
                    return {
                        id: -1,
                        type: FlowNodeType.Jump,
                        statement,
                        next: to,
                        mergable: true,
                    };
                }
            }
            case StatementType.Continue: {
                const to = breakableNodeStack.at(-1);
                if (!to) {
                    throw new Error(`unexcepted continue`);
                }
                return {
                    id: -1,
                    type: FlowNodeType.Jump,
                    statement,
                    next: to,
                    mergable: true,
                };
            }
            case StatementType.Exit: {
                return {
                    id: -1,
                    type: FlowNodeType.Exit,
                    statement,
                    mergable: true,
                };
            }
            default: {
                throw "unknown statement type";
            }
        }
    }
    const implicitReturnNode: ReturnFlowNode = {
        id: -1,
        type: FlowNodeType.Return,
        statement: {
            type: StatementType.Return,
        },
        mergable: true,
    };
    const root = toBlockFlowNode(program, implicitReturnNode);
    root.nodes.push(implicitReturnNode);
    const labelingFlowNode = (node: FlowNode) => {
        switch (node.type) {
            case FlowNodeType.Normal:
            case FlowNodeType.Return:
            case FlowNodeType.Jump:
            case FlowNodeType.Exit: {
                addNode(node);
                break;
            }
            case FlowNodeType.ExternCall: {
                addNode(node);
                break;
            }
            case FlowNodeType.If:
            case FlowNodeType.Switch: {
                addNode(node);
                node.branches.forEach((branch) => labelingFlowNode(branch.node));
                if (node.otherwise) labelingFlowNode(node.otherwise);
                break;
            }
            case FlowNodeType.LoopInitializer: {
                addNode(node);
                labelingFlowNode(node.main);
                break;
            }
            case FlowNodeType.Loop: {
                addNode(node);
                labelingFlowNode(node.body);
                break;
            }
            case FlowNodeType.Block: {
                node.nodes.forEach((node) => {
                    labelingFlowNode(node);
                });
                node.id = node.nodes[0].id;
                break;
            }
        }
    }
    labelingFlowNode(root);
    return root;
}

const emitJITExpression = (expression: Expression) => {
    const code = expression.toString();
    const [parameterList, rawBody] = code.split("=>");
    const body = rawBody.trim();
    return `(${body})`;
};

export const nodeGenPass = (program: BlockFlowNode, getBuiltInFunction: (name: string) => BuiltInFunction): ExecutionNode[] => {
    const nodeMap: ExecutionNode[] = Array(program.next.id).fill(null);
    const addNode = (id: number, node: ExecutionNode) => {
        nodeMap[id] = node;
    };
    const emitJITNode = (nodes: FlowNode[]) => {
        console.log("emitJITNode", nodes);
        const entry = nodes[0];
        const builtInFunctions: Record<string, CallableFunction> = {};
        const emitJITCode = (node: FlowNode): string => {
            switch (node.type) {
                case FlowNodeType.Normal: {
                    const { statement } = node;
                    if (statement.type === StatementType.Expression) {
                        const prefix = statement.async ? 'await ' : '';
                        return `${prefix}${emitJITExpression(statement.expression)};`;
                    } else {
                        const { builtIn, async, functionName } = statement;
                        if (!builtIn) {
                            throw new Error("unexcept node");
                        }
                        const prefix = async ? 'await ' : '';
                        builtInFunctions[functionName] = getBuiltInFunction(functionName).func;
                        const parameterListCode = Object.entries(statement.parameters).map(([k, v]) => {
                            const value = `${isFunction(v) ? emitJITExpression(v) : v}`;
                            return `"${k}": ${value}`;
                        }).join(",");
                        return `${prefix}helper.builtIn.${statement.functionName}({${parameterListCode}}, env);`;
                    }
                }
                case FlowNodeType.ExternCall: {
                    throw new Error("unexcept jit node, extern call can't emit jit");
                }
                case FlowNodeType.Return: {
                    const { statement } = node;
                    if (isFunction(statement.value)) {
                        return `return [${OPType.Return}, ${emitJITExpression(statement.value)}];`;
                    } else {
                        return `return [${OPType.Return}, ${statement.value}];`;
                    }
                }
                case FlowNodeType.If: {
                    const branchListCode = node.branches.map((branch) => {
                        return `if (${emitJITExpression(branch.condition)})${emitJITCode(branch.node)}`;
                    }).join("else");
                    const otherwiseCode = node.otherwise ? `else ${emitJITCode(node.otherwise)}` : '';
                    return `${branchListCode}${otherwiseCode}`;
                }
                case FlowNodeType.Switch: {
                    const branchListCode = node.branches.map((branch) => {
                        return `case (${emitJITExpression(branch.condition)}): ${emitJITCode(branch.node)}`;
                    }).join("\n");
                    const otherwiseCode = node.otherwise ? `default: ${emitJITCode(node.otherwise)}` : '';
                    return `switch (${emitJITExpression(node.statement.pattern)}){${branchListCode}${otherwiseCode}}`;
                }
                case FlowNodeType.LoopInitializer: {
                    return emitJITCode(node.main);
                }
                case FlowNodeType.Loop: {
                    const { statement } = node;
                    const initializerCode = statement.initializer ? emitJITExpression(statement.initializer) : "";
                    const iteratorCode = statement.iterator ? emitJITExpression(statement.iterator) : "";
                    const conditionCode = statement.condition ? emitJITExpression(statement.condition) : "";
                    const bodyCode = emitJITCode(node.body);
                    if (statement.skipInitialCheck) {
                        return `${initializerCode}; do { ${bodyCode} ${iteratorCode}; } while (${conditionCode});`;
                    }
                    return `for (${initializerCode}; ${conditionCode}; ${iteratorCode}) ${bodyCode}`;
                }
                case FlowNodeType.Jump: {
                    const { statement } = node;
                    // 一个 trick: 当跳出地址 < jitBlock 根地址时才是跳出 jitBlock
                    if (node.next.id < entry.id) {
                        return `return [${OPType.Move}, ${node.next.id}];`;
                    }
                    if (statement.type === StatementType.Break) {
                        if (statement.label) {
                            return `break ${statement.label};`;
                        }
                        return `break;`;
                    } else {
                        return `continue;`;
                    }
                }
                case FlowNodeType.Block: {
                    return `{\n${node.nodes.map((node) => emitJITCode(node)).join("\n")}\n}`;
                }
                case FlowNodeType.Exit: {
                    return `return [${OPType.Exit}];`;
                }
                default: {
                    throw "unknown statement type";
                }
            }
        }
        const code = nodes.map((node) => emitJITCode(node)).join("\n");
        // @ts-ignore
        const jitFunction = new AsyncFunction("{ local, args, env }", "helper", code);
        addNode(nodes[0].id, (scope) => jitFunction(scope, {
            builtIn: builtInFunctions,
        }));
    }
    const emitNode = (node: FlowNode) => {
        switch (node.type) {
            case FlowNodeType.Normal: {
                const { statement } = node;
                if (statement.type === StatementType.Expression) {
                    if (statement.async) {
                        addNode(node.id, async (scope: Scope) => {
                            await statement.expression(scope);
                            return [OPType.Move, node.next.id];
                        });
                    } else {
                        addNode(node.id, (scope: Scope) => {
                            statement.expression(scope);
                            return [OPType.Move, node.next.id];
                        });
                    }
                } else {
                    if (statement.builtIn) {
                        const builtFunc = getBuiltInFunction(statement.functionName);
                        if (statement.async) {
                            addNode(node.id, async (scope) => {
                                const statementParameters = mapValues(statement.parameters, (value) => {
                                    if (isFunction(value)) return value(scope);
                                    return value;
                                });
                                await builtFunc.func(statementParameters, scope.env);
                                return [OPType.Move, node.next.id];
                            });
                        } else {
                            addNode(node.id, (scope) => {
                                const statementParameters = mapValues(statement.parameters, (value) => {
                                    if (isFunction(value)) return value(scope);
                                    return value;
                                });
                                builtFunc.func(statementParameters, scope.env);
                                return [OPType.Move, node.next.id];
                            });
                        }
                    } else {
                        throw new Error("not impelement");
                    }
                }
                break;
            }
            case FlowNodeType.ExternCall: {
                const { statement } = node;
                if (statement.async) {
                    addNode(node.id, (scope) => {
                        const statementParameters = mapValues(statement.parameters, (value) => {
                            if (isFunction(value)) return value(scope);
                            return value;
                        });
                        return [OPType.Call, statement.functionName, statementParameters, node.next.id];
                    });
                } else {
                    addNode(node.id, (scope) => {
                        const statementParameters = mapValues(statement.parameters, (value) => {
                            if (isFunction(value)) return value(scope);
                            return value;
                        });
                        return [OPType.Call, statement.functionName, statementParameters, node.next.id];
                    });
                }
                return;
            }
            case FlowNodeType.Return: {
                const { statement } = node;
                if (isFunction(statement.value)) {
                    addNode(node.id, async (scope: Scope) => [OPType.Return, await (statement.value as Expression)(scope)]);
                } else {
                    addNode(node.id, () => [OPType.Return, statement.value]);
                }
                break;
            }
            case FlowNodeType.If: {
                node.branches.forEach(({ node }) => {
                    emitNode(node);
                });
                if (node.otherwise) emitNode(node.otherwise);
                addNode(node.id, async (scope: Scope) => {
                    for (const branch of node.branches) {
                        if (await branch.condition(scope)) {
                            return [OPType.Move, branch.node.id];
                        }
                    }
                    if (node.otherwise !== void 0) {
                        return [OPType.Move, node.otherwise.id]
                    }
                    return [OPType.Move, node.next.id];
                });
                break;
            }
            case FlowNodeType.Switch: {
                node.branches.forEach(({ node }) => {
                    emitNode(node);
                });
                if (node.otherwise) emitNode(node.otherwise);
                const pattern = node.statement.pattern;
                addNode(node.id, async (scope: Scope) => {
                    for (const branch of node.branches) {
                        if (pattern(scope) === await branch.condition(scope)) {
                            return [OPType.Move, branch.node.id];
                        }
                    }
                    if (node.otherwise !== void 0) {
                        return [OPType.Move, node.otherwise.id]
                    }
                    return [OPType.Move, node.next.id];
                });
                break;
            }
            case FlowNodeType.LoopInitializer: {
                const { main } = node;
                if (main.statement.skipInitialCheck) {
                    addNode(node.id, async (scope) => {
                        await main.statement.initializer!(scope);
                        return [OPType.Move, main.body.id];
                    });
                } else {
                    addNode(node.id, async (scope) => {
                        await main.statement.initializer!(scope);
                        return [OPType.Move, main.id];
                    });
                }
                emitNode(node.main);
                break;
            }
            case FlowNodeType.Loop: {
                const { statement } = node;
                addNode(node.id, async (scope) => {
                    if (statement.iterator) {
                        statement.iterator(scope);
                    }
                    if (statement.condition && await statement.condition(scope)) {
                        return [OPType.Move, node.body.id];
                    } else {
                        return [OPType.Move, node.next.id];
                    }
                });
                emitNode(node.body);
                break;
            }
            case FlowNodeType.Jump: {
                return addNode(node.id, () => [OPType.Move, node.next.id]);
            }
            case FlowNodeType.Block: {
                const chunks = splitArray(node.nodes, (node) => !node.mergable);
                for (const chunk of chunks) {
                    if (chunk.length === 0) continue;
                    if (chunk.length === 1 && (![FlowNodeType.If, FlowNodeType.Switch, FlowNodeType.Loop].includes(chunk[0].type) || !chunk[0].mergable)) {
                        emitNode(chunk[0]);
                    } else {
                        emitJITNode(chunk);
                    }
                }
                // for (const xnode of node.nodes) {
                //     emitNode(xnode);
                // }
                break;
            }
            case FlowNodeType.Exit: {
                return addNode(node.id, () => [OPType.Exit]);
            }
            default: {
                throw "unknown statement type";
            }
        }
    };
    emitNode(program);
    return nodeMap;
}

export const compile = (script: Block, getBuiltInFunction: (name: string) => BuiltInFunction) => {
    const flowRoot = flowAnalyzePass(script);
    console.log(flowRoot);
    const program = nodeGenPass(flowRoot, getBuiltInFunction);
    console.log(program);
    return program;
}
