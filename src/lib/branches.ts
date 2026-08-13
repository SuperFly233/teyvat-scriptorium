import type { DialogueLine } from "../types";

type BranchMark = Pick<
  DialogueLine,
  | "branchGroupId"
  | "branchIndex"
  | "branchDepth"
  | "branchTotal"
  | "branchRole"
  | "branchFlow"
  | "branchMergeNodeId"
>;

const outgoing = (line?: DialogueLine) =>
  (line?.nextNodeIds?.length ? line.nextNodeIds : [line?.nextNodeId || ""])
    .filter(Boolean)
    .filter((id) => id !== "finish");

function distances(
  start: string,
  nodes: Map<string, DialogueLine>,
  stopAt?: string,
) {
  const result = new Map<string, number>();
  const queue: Array<[string, number]> = [[start, 0]];
  while (queue.length && result.size < 240) {
    const [id, depth] = queue.shift()!;
    if (!id || result.has(id) || !nodes.has(id)) continue;
    result.set(id, depth);
    if (id === stopAt) continue;
    outgoing(nodes.get(id)).forEach((next) => queue.push([next, depth + 1]));
  }
  return result;
}

export function enrichBranches(lines: DialogueLine[]): DialogueLine[] {
  const realLines = lines.filter((line) => !line.nodeId.endsWith("-player"));
  const nodes = new Map(realLines.map((line) => [line.nodeId, line]));
  const selectors = new Map<string, DialogueLine[]>();
  lines
    .filter((line) => line.nodeId.endsWith("-player"))
    .forEach((line) => {
      const list = selectors.get(line.nodeId) || [];
      list.push(line);
      selectors.set(line.nodeId, list);
    });
  const marks = new Map<string, BranchMark>();

  const promptCandidates = realLines.filter((line) => {
    const graphTargets = outgoing(line);
    const synthetic = selectors.get(`${line.nodeId}-player`) || [];
    return graphTargets.length > 1 || synthetic.length > 1;
  }).map((prompt) => ({ prompt, groupId: `${prompt.nodeId}-player` }));
  selectors.forEach((_, groupId) => {
    if (!promptCandidates.some((entry) => entry.groupId === groupId))
      promptCandidates.push({ prompt: undefined as unknown as DialogueLine, groupId });
  });

  for (const { prompt, groupId } of promptCandidates) {
    const synthetic = (selectors.get(groupId) || []).sort(
      (a, b) => a.variant - b.variant,
    );
    const graphTargets = outgoing(prompt);
    const targets = [
      ...new Set(
        (graphTargets.length > 1
          ? graphTargets
          : synthetic.map((line) => line.nextNodeId || "")
        ).filter(Boolean),
      ),
    ];
    if (targets.length < 2) continue;

    const reach = targets.map((target) => distances(target, nodes));
    const common = [...reach[0].keys()].filter((id) =>
      reach.every((map) => map.has(id)),
    );
    const merge = common.sort((a, b) => {
      const score = (id: string) => [
        Math.max(...reach.map((map) => map.get(id) ?? 999)),
        reach.reduce((sum, map) => sum + (map.get(id) ?? 999), 0),
      ];
      const [aMax, aSum] = score(a);
      const [bMax, bSum] = score(b);
      return aMax - bMax || aSum - bSum;
    })[0];

    const returns = reach.map((map) =>
      [...map.keys()].some((id) => outgoing(nodes.get(id)).includes(groupId)),
    );
    const pathSets = targets.map((target, branchIndex) => {
      const reachable = distances(target, nodes, merge);
      const exclusive = [...reachable.keys()].filter(
        (id) => id !== merge && !reach.some((map, index) => index !== branchIndex && map.has(id)),
      );
      return new Set(exclusive);
    });
    const flow: DialogueLine["branchFlow"] = returns.some(Boolean)
      ? "loop"
      : merge
        ? pathSets.some((path) => path.size > 1)
          ? "divergent"
          : "convergent"
        : reach.every((map) =>
              [...map.keys()].some((id) =>
                (nodes.get(id)?.nextNodeIds?.length
                  ? nodes.get(id)?.nextNodeIds
                  : [nodes.get(id)?.nextNodeId]
                )?.includes("finish"),
              ),
            )
          ? "independent"
          : "unresolved";

    if (prompt)
      marks.set(prompt.nodeId, {
        branchGroupId: groupId,
        branchIndex: -1,
        branchDepth: -1,
        branchTotal: targets.length,
        branchRole: "prompt",
        branchFlow: flow,
        branchMergeNodeId: merge,
      });
    pathSets.forEach((path, branchIndex) => {
      path.forEach((id) => {
        marks.set(id, {
          branchGroupId: groupId,
          branchIndex,
          branchDepth: reach[branchIndex].get(id) ?? 0,
          branchTotal: targets.length,
          branchRole: id === targets[branchIndex] ? "option" : "response",
          branchFlow: flow,
          branchMergeNodeId: merge,
        });
      });
    });
  }

  return realLines.map((line) => {
    const mark = marks.get(line.nodeId);
    return mark
      ? {
          ...line,
          ...mark,
          kind: mark.branchRole === "option" ? "choice" : line.kind,
        }
      : line;
  });
}
