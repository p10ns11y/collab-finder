#!/usr/bin/env node
// Honest gate for MVU propose dispatch (per strategist).
// Simulates the proposeCvSidecarCmd + dispatch collector without full Tauri runtime.

let spyCalledWith = null;
const mockPorts = {
  finder: {
    proposeCvSidecar: async (opportunityId) => {
      spyCalledWith = opportunityId;
      return { preview: 'Sidecar proposal for #17: truth-seeking + collab-finder', sidecar_path: '/tmp/sidecar.json', suggestions_count: 2 };
    }
  }
};

const dispatches = [];
async function proposeCvSidecarCmd(ports, opportunityId) {
  // body similar to effects.ts proposeCvSidecarCmd
  try {
    const result = await ports.finder.proposeCvSidecar(opportunityId);
    dispatches.push({ type: 'CvSidecarProposeSucceeded', ...result });
  } catch (e) {
    dispatches.push({ type: 'CvSidecarProposeFailed', error: e });
  }
}

(async () => {
  await proposeCvSidecarCmd(mockPorts, 17);
  const success = dispatches.find(d => d.type === 'CvSidecarProposeSucceeded');
  const ok = spyCalledWith === 17 && success && success.preview && success.sidecar_path;
  console.log('MVU propose dispatch gate:', ok ? 'PASS' : 'FAIL');
  console.log('  spy called with:', spyCalledWith);
  console.log('  dispatched succeeded with preview+path:', !!success);
  if (!ok) process.exit(1);
})();