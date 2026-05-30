// ============================================================
// src/app.jsx — Root with theme state + routing
// ============================================================

const SECTION_META = {
  dashboard: { title: 'Cluster overview',     sub: 'Live aggregate of all 3 nodes — global state, agents, and event stream.' },
  nodes:     { title: 'Nodes & network',      sub: 'Topology, latency, hardware utilization, and per-node controls.' },
  chat:      { title: 'Chat playground',      sub: 'Sharded inference across the cluster. Switch templates on the left.' },
  models:    { title: 'Model hub',            sub: 'Installed weights and discovery — pull from Hugging Face / Ollama registry.' },
  knowledge: { title: 'Knowledge base',       sub: 'Retrieval-augmented context. Drop files or connect an Obsidian vault.' },
  energy:    { title: 'Energy & cost',         sub: 'Power consumption, kWh used, and CO₂ emitted across all nodes.' },
  settings:  { title: 'Settings',             sub: 'Inference parameters, system config, and cluster performance tuning.' },
};

function App() {
  const [active, setActive] = React.useState('dashboard');
  const [theme, setTheme] = React.useState('deepsea');
  const [selectedNodeId, setSelectedNodeId] = React.useState('n1');
  const [deployFor, setDeployFor] = React.useState(null); // null | modelId-string | '__current__'
  const cluster = useCluster();

  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const themeCtx = React.useMemo(() => ({ theme, setTheme }), [theme]);
  const meta = SECTION_META[active] || SECTION_META.dashboard;

  const openNode = (id) => {
    setSelectedNodeId(id);
    setActive('nodes');
  };

  const openDeployment = (modelId) => setDeployFor(modelId || cluster.deployment.activeModelId);
  const closeDeployment = () => setDeployFor(null);

  return (
    <ThemeContext.Provider value={themeCtx}>
      <div className="h-full flex flex-col">
        <TopBar cluster={cluster} sectionTitle={meta.title} sectionSub={meta.sub} onSelectNode={openNode} onDeploy={openDeployment} />
        <div className="flex-1 flex min-h-0">
          <Sidebar active={active} setActive={setActive} cluster={cluster} onDeploy={openDeployment} />
          <main className="flex-1 flex flex-col min-w-0 min-h-0">
            <div key={active} className="flex-1 flex flex-col min-w-0 min-h-0 fade-up">
              {active === 'dashboard' && <Dashboard cluster={cluster} onJumpTo={setActive} onSelectNode={openNode} onDeploy={openDeployment} />}
              {active === 'nodes'     && <NodesNetwork cluster={cluster} selectedNodeId={selectedNodeId} setSelectedNodeId={setSelectedNodeId} onDeploy={openDeployment} />}
              {active === 'chat'      && <ChatPlayground cluster={cluster} />}
              {active === 'models'    && <ModelHub cluster={cluster} onDeploy={openDeployment} />}
              {active === 'knowledge' && <KnowledgeBase />}
              {active === 'energy'    && <EnergyView cluster={cluster} />}
              {active === 'settings'  && <Settings />}
            </div>
          </main>
        </div>
        <DeploymentDialog
          open={deployFor !== null}
          cluster={cluster}
          initialModelId={deployFor}
          onClose={closeDeployment}
        />
      </div>
    </ThemeContext.Provider>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
