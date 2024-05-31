export enum StatementType {
    Expression,

    Call,
    Return,

    If,
    Switch,
    Loop,
    Break,
    Continue,
    Block,

    Exit,

    FunctionDeclare,
}

export type Literal = string | number | boolean | null;
export type Expression = (env: Scope) => any;
export type Value = Literal | Expression;

export type Block = Statement[];

export interface ExpressionStatement {
    type: StatementType.Expression;
    expression: Expression;
    async?: boolean;
}

export interface CallStatement {
    type: StatementType.Call;
    functionName: string;
    parameters: Record<string, Value>;
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
    label?: string;
}

export interface ContinueStatement {
    type: StatementType.Continue;
}

export interface ExitStatement {
    type: StatementType.Exit;
}

export type Statement =
    | ExpressionStatement
    | CallStatement
    | ReturnStatement
    | IfStatement
    | SwitchStatement
    | LoopStatement
    | BreakStatement
    | ContinueStatement
    | ExitStatement
    ;

export enum FlowNodeType {
    Normal,
    ExternCall,
    Return,
    If,
    Switch,
    Loop,
    LoopInitializer,
    Jump,
    Exit,
    Block,
    Idle,
}

export interface FlowNodeBase {
    id: number;
    type: FlowNodeType;
    mergable: boolean;
}

export interface NormalFlowNode extends FlowNodeBase {
    type: FlowNodeType.Normal;
    statement: CallStatement | ExpressionStatement;
    next: FlowNode;
}

export interface ExternCallFlowNode extends FlowNodeBase {
    type: FlowNodeType.ExternCall;
    statement: CallStatement;
    receiver?: number;
    next: FlowNode;
}

export interface ReturnFlowNode extends FlowNodeBase {
    type: FlowNodeType.Return;
    statement: ReturnStatement;
}

export interface FlowBranch {
    condition: Expression;
    node: BlockFlowNode;
}

export interface IfFlowNode extends FlowNodeBase {
    type: FlowNodeType.If;
    statement: IfStatement;
    branches: FlowBranch[];
    otherwise?: BlockFlowNode;
    next: FlowNode;
}

export interface SwitchFlowNode extends FlowNodeBase {
    type: FlowNodeType.Switch;
    statement: SwitchStatement;
    branches: FlowBranch[];
    otherwise?: BlockFlowNode;
    next: FlowNode;
}

export interface LoopFlowNode extends FlowNodeBase {
    type: FlowNodeType.Loop;
    statement: LoopStatement;
    body: BlockFlowNode;
    next: FlowNode;
}

export interface LoopInitializerFlowNode extends FlowNodeBase {
    type: FlowNodeType.LoopInitializer;
    main: LoopFlowNode;
}

export interface JumpFlowNode extends FlowNodeBase {
    type: FlowNodeType.Jump;
    statement: BreakStatement | ContinueStatement;
    next: FlowNode;
}

export interface ExitFlowNode extends FlowNodeBase {
    type: FlowNodeType.Exit;
    statement: ExitStatement;
}

export interface BlockFlowNode extends FlowNodeBase {
    type: FlowNodeType.Block;
    nodes: FlowNode[];
    next: FlowNode;
}

export type FlowNode =
    | NormalFlowNode
    | ExternCallFlowNode
    | ReturnFlowNode
    | IfFlowNode
    | SwitchFlowNode
    | LoopFlowNode
    | LoopInitializerFlowNode
    | JumpFlowNode
    | ExitFlowNode
    | BlockFlowNode
    ;

export enum OPType {
    Move,
    Call,
    Return,
    Exit,
}

export type OP =
    | [OPType.Move, next: number]
    | [OPType.Call, name: string, parameters: Record<string, any>, next: number]
    | [OPType.Return, returnValue?: any]
    | [OPType.Exit]
    ;

export interface Scope {
    args: Record<string, any>;
    local: Record<string, any>;
    env: Record<string, any>;
}

export type ExecutionNode = (scope: Scope) => Promise<OP> | OP;
