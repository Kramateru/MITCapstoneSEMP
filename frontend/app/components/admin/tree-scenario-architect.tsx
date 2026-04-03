'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Badge } from '../ui/badge';
import { Slider } from '../ui/slider';
import { Switch } from '../ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Separator } from '../ui/separator';
import { ScrollArea } from '../ui/scroll-area';
import { 
  Plus, 
  Trash2, 
  GitBranch, 
  MessageCircle, 
  UserCircle,
  Save,
  Download,
  Upload,
  Zap,
  Settings,
  Globe,
  Target,
  Copy
} from 'lucide-react';
import { toast } from 'sonner';

interface ScenarioNode {
  id: string;
  type: 'customer_prompt' | 'agent_response' | 'logic_branch';
  title: string;
  content: string;
  position: { x: number; y: number };
  connections: string[];
  nlpConfig?: NLPConfig;
  audioUrl?: string;
}

interface NLPConfig {
  keywordScoring: {
    empathyKeywords: string[];
    probingKeywords: string[];
    requiredKeywords: string[];
  };
  confidenceThreshold: number;
  multiLanguage: {
    enabled: boolean;
    languages: string[];
  };
  asrSettings: {
    sensitivity: number;
    backgroundNoiseFilter: boolean;
  };
}

interface ScenarioTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  nodeCount: number;
}

export default function TreeScenarioArchitect() {
  const [nodes, setNodes] = useState<ScenarioNode[]>([
    {
      id: 'node-1',
      type: 'customer_prompt',
      title: 'Initial Greeting',
      content: "I'm calling because I was charged twice for my subscription!",
      position: { x: 100, y: 100 },
      connections: ['node-2'],
      audioUrl: '/audio/greeting.mp3'
    },
    {
      id: 'node-2',
      type: 'agent_response',
      title: 'Empathy & Acknowledgment',
      content: 'Agent must acknowledge issue with empathy',
      position: { x: 400, y: 100 },
      connections: ['node-3', 'node-4'],
      nlpConfig: {
        keywordScoring: {
          empathyKeywords: ['understand', 'apologize', 'frustrating', 'help'],
          probingKeywords: ['verify', 'confirm', 'when'],
          requiredKeywords: ['account']
        },
        confidenceThreshold: 75,
        multiLanguage: {
          enabled: true,
          languages: ['English-US', 'English-PH']
        },
        asrSettings: {
          sensitivity: 80,
          backgroundNoiseFilter: true
        }
      }
    },
    {
      id: 'node-3',
      type: 'logic_branch',
      title: 'Good Response Path',
      content: 'If empathy score > 80',
      position: { x: 700, y: 50 },
      connections: []
    },
    {
      id: 'node-4',
      type: 'logic_branch',
      title: 'Needs Improvement Path',
      content: 'If empathy score < 80',
      position: { x: 700, y: 150 },
      connections: []
    }
  ]);

  const [selectedNode, setSelectedNode] = useState<ScenarioNode | null>(null);
  const [showTemplateLibrary, setShowTemplateLibrary] = useState(false);

  // Scenario Templates
  const templates: ScenarioTemplate[] = [
    {
      id: 'tmpl-1',
      name: 'Billing Dispute Resolution',
      description: 'Complete workflow for handling billing complaints',
      category: 'Billing',
      nodeCount: 12
    },
    {
      id: 'tmpl-2',
      name: 'Technical Troubleshooting',
      description: 'Step-by-step technical support scenario',
      category: 'Tech Support',
      nodeCount: 15
    },
    {
      id: 'tmpl-3',
      name: 'Account Verification',
      description: 'Security-focused account verification flow',
      category: 'Security',
      nodeCount: 8
    },
    {
      id: 'tmpl-4',
      name: 'Product Upgrade Sales',
      description: 'Sales scenario with objection handling',
      category: 'Sales',
      nodeCount: 10
    },
    {
      id: 'tmpl-5',
      name: 'Complaint De-escalation',
      description: 'Complex de-escalation with empathy focus',
      category: 'Customer Service',
      nodeCount: 14
    },
    {
      id: 'tmpl-6',
      name: 'Password Reset',
      description: 'Simple password reset with security questions',
      category: 'Tech Support',
      nodeCount: 6
    }
  ];

  const handleAddNode = (type: ScenarioNode['type']) => {
    const newNode: ScenarioNode = {
      id: `node-${Date.now()}`,
      type,
      title: type === 'customer_prompt' ? 'New Customer Prompt' : 
             type === 'agent_response' ? 'New Agent Response' : 'New Logic Branch',
      content: '',
      position: { x: Math.random() * 500 + 100, y: Math.random() * 300 + 100 },
      connections: []
    };
    setNodes([...nodes, newNode]);
    setSelectedNode(newNode);
    toast.success(`${type.replace('_', ' ')} node added`);
  };

  const handleDeleteNode = (nodeId: string) => {
    setNodes(nodes.filter(n => n.id !== nodeId));
    if (selectedNode?.id === nodeId) {
      setSelectedNode(null);
    }
    toast.success('Node deleted');
  };

  const handleUpdateNode = (updates: Partial<ScenarioNode>) => {
    if (!selectedNode) return;
    
    const updatedNodes = nodes.map(node =>
      node.id === selectedNode.id ? { ...node, ...updates } : node
    );
    setNodes(updatedNodes);
    setSelectedNode({ ...selectedNode, ...updates });
  };

  const handleLoadTemplate = (template: ScenarioTemplate) => {
    toast.success(`Template "${template.name}" loaded`);
    setShowTemplateLibrary(false);
  };

  const handleSaveScenario = () => {
    toast.success('Scenario saved successfully');
  };

  const handleExportScenario = () => {
    toast.success('Scenario exported as JSON');
  };

  return (
    <div className="h-screen flex">
      {/* Left Sidebar: Template Library */}
      <div className={`${showTemplateLibrary ? 'w-80' : 'w-0'} transition-all duration-300 border-r overflow-hidden`}>
        <Card className="h-full rounded-none border-0">
          <CardHeader className="border-b">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Quick Setup Templates</CardTitle>
              <Button 
                size="sm" 
                variant="ghost" 
                onClick={() => setShowTemplateLibrary(false)}
              >
                -
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[calc(100vh-8rem)]">
              <div className="p-4 space-y-3">
                {templates.map((template) => (
                  <div
                    key={template.id}
                    onClick={() => handleLoadTemplate(template)}
                    className="p-3 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <h4 className="text-sm font-medium">{template.name}</h4>
                      <Badge variant="outline" className="text-xs">{template.nodeCount} nodes</Badge>
                    </div>
                    <p className="text-xs text-gray-500 mb-2">{template.description}</p>
                    <Badge className="text-xs">{template.category}</Badge>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Main Canvas */}
      <div className="flex-1 flex flex-col">
        {/* Toolbar */}
        <div className="border-b p-4 bg-white dark:bg-gray-900">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-medium">Complex Scenario Architect</h2>
              <Badge variant="outline">Draft</Badge>
            </div>

            <div className="flex items-center gap-2">
              {!showTemplateLibrary && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowTemplateLibrary(true)}
                >
                  <Upload className="size-4 mr-2" />
                  Templates
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={handleSaveScenario}>
                <Save className="size-4 mr-2" />
                Save
              </Button>
              <Button size="sm" variant="outline" onClick={handleExportScenario}>
                <Download className="size-4 mr-2" />
                Export
              </Button>
            </div>
          </div>

          {/* Node Creation Buttons */}
          <div className="flex items-center gap-2 mt-4">
            <span className="text-sm text-gray-500">Add Node:</span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleAddNode('customer_prompt')}
            >
              <MessageCircle className="size-4 mr-2" />
              Customer Prompt
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleAddNode('agent_response')}
            >
              <UserCircle className="size-4 mr-2" />
              Agent Response
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleAddNode('logic_branch')}
            >
              <GitBranch className="size-4 mr-2" />
              Logic Branch
            </Button>
          </div>
        </div>

        <div className="flex-1 flex">
          {/* Canvas Area */}
          <div className="flex-1 relative overflow-auto bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800"
               style={{
                 backgroundImage: 'radial-gradient(circle, #e5e7eb 1px, transparent 1px)',
                 backgroundSize: '20px 20px'
               }}
          >
            <div className="absolute inset-0 p-8">
              {/* Render Nodes */}
              {nodes.map((node) => (
                <div
                  key={node.id}
                  onClick={() => setSelectedNode(node)}
                  className={`absolute cursor-pointer transition-all ${
                    selectedNode?.id === node.id 
                      ? 'ring-2 ring-blue-500 shadow-lg scale-105' 
                      : 'hover:shadow-md'
                  }`}
                  style={{
                    left: node.position.x,
                    top: node.position.y,
                    width: '200px'
                  }}
                >
                  <Card className={`${
                    node.type === 'customer_prompt' 
                      ? 'bg-purple-50 dark:bg-purple-950 border-purple-300 dark:border-purple-700'
                      : node.type === 'agent_response'
                      ? 'bg-blue-50 dark:bg-blue-950 border-blue-300 dark:border-blue-700'
                      : 'bg-yellow-50 dark:bg-yellow-950 border-yellow-300 dark:border-yellow-700'
                  }`}>
                    <CardHeader className="p-3 pb-2">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          {node.type === 'customer_prompt' && <MessageCircle className="size-4 text-purple-600" />}
                          {node.type === 'agent_response' && <UserCircle className="size-4 text-blue-600" />}
                          {node.type === 'logic_branch' && <GitBranch className="size-4 text-yellow-600" />}
                          <CardTitle className="text-xs">{node.title}</CardTitle>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="size-6 p-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteNode(node.id);
                          }}
                        >
                          <Trash2 className="size-3" />
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="p-3 pt-0">
                      <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-3">
                        {node.content || 'No content'}
                      </p>
                      {node.connections.length > 0 && (
                        <div className="mt-2 flex items-center gap-1 text-xs text-gray-500">
                          <GitBranch className="size-3" />
                          {node.connections.length} connection{node.connections.length > 1 ? 's' : ''}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              ))}

              {/* Connection Lines (simplified) */}
              <svg className="absolute inset-0 pointer-events-none" style={{ zIndex: 0 }}>
                {nodes.flatMap(node =>
                  node.connections.map(targetId => {
                    const target = nodes.find(n => n.id === targetId);
                    if (!target) return null;
                    return (
                      <line
                        key={`${node.id}-${targetId}`}
                        x1={node.position.x + 100}
                        y1={node.position.y + 60}
                        x2={target.position.x + 100}
                        y2={target.position.y + 20}
                        stroke="#3b82f6"
                        strokeWidth="2"
                        markerEnd="url(#arrowhead)"
                      />
                    );
                  })
                )}
                <defs>
                  <marker
                    id="arrowhead"
                    markerWidth="10"
                    markerHeight="10"
                    refX="9"
                    refY="3"
                    orient="auto"
                  >
                    <polygon points="0 0, 10 3, 0 6" fill="#3b82f6" />
                  </marker>
                </defs>
              </svg>
            </div>
          </div>

          {/* Right Panel: NLP Configuration */}
          {selectedNode && (
            <div className="w-96 border-l bg-white dark:bg-gray-900 overflow-y-auto">
              <div className="p-4 border-b">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium">Node Configuration</h3>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setSelectedNode(null)}
                  >
                    -
                  </Button>
                </div>
              </div>

              <ScrollArea className="h-[calc(100vh-8rem)]">
                <div className="p-4 space-y-6">
                  {/* Basic Info */}
                  <div className="space-y-3">
                    <div>
                      <Label>Node Type</Label>
                      <Badge className="mt-1">
                        {selectedNode.type.replace('_', ' ')}
                      </Badge>
                    </div>

                    <div>
                      <Label>Title</Label>
                      <Input
                        value={selectedNode.title}
                        onChange={(e) => handleUpdateNode({ title: e.target.value })}
                        placeholder="Node title"
                      />
                    </div>

                    <div>
                      <Label>Content / Instructions</Label>
                      <Textarea
                        value={selectedNode.content}
                        onChange={(e) => handleUpdateNode({ content: e.target.value })}
                        placeholder="Enter node content or instructions..."
                        rows={4}
                      />
                    </div>

                    {selectedNode.type === 'customer_prompt' && (
                      <div>
                        <Label>Audio File URL</Label>
                        <Input
                          value={selectedNode.audioUrl || ''}
                          onChange={(e) => handleUpdateNode({ audioUrl: e.target.value })}
                          placeholder="/audio/prompt.mp3"
                        />
                      </div>
                    )}
                  </div>

                  {/* NLP Configuration (for agent_response nodes) */}
                  {selectedNode.type === 'agent_response' && (
                    <>
                      <Separator />
                      
                      <div className="space-y-4">
                        <div className="flex items-center gap-2">
                          <Zap className="size-5 text-yellow-600" />
                          <h4 className="font-medium">AI Configuration</h4>
                        </div>

                        {/* Keyword Scoring */}
                        <div className="space-y-3">
                          <Label className="flex items-center gap-2">
                            <Target className="size-4" />
                            Empathy Keywords
                          </Label>
                          <Input
                            placeholder="understand, apologize, frustrating..."
                            value={selectedNode.nlpConfig?.keywordScoring.empathyKeywords.join(', ') || ''}
                            onChange={(e) => handleUpdateNode({
                              nlpConfig: {
                                ...selectedNode.nlpConfig!,
                                keywordScoring: {
                                  ...selectedNode.nlpConfig!.keywordScoring,
                                  empathyKeywords: e.target.value.split(',').map(k => k.trim())
                                }
                              }
                            })}
                          />

                          <Label className="flex items-center gap-2 mt-3">
                            <Target className="size-4" />
                            Probing Keywords
                          </Label>
                          <Input
                            placeholder="verify, confirm, when, how..."
                            value={selectedNode.nlpConfig?.keywordScoring.probingKeywords.join(', ') || ''}
                            onChange={(e) => handleUpdateNode({
                              nlpConfig: {
                                ...selectedNode.nlpConfig!,
                                keywordScoring: {
                                  ...selectedNode.nlpConfig!.keywordScoring,
                                  probingKeywords: e.target.value.split(',').map(k => k.trim())
                                }
                              }
                            })}
                          />

                          <Label className="flex items-center gap-2 mt-3">
                            <Target className="size-4 text-red-600" />
                            Required Keywords
                          </Label>
                          <Input
                            placeholder="account, verify, confirm..."
                            value={selectedNode.nlpConfig?.keywordScoring.requiredKeywords.join(', ') || ''}
                            onChange={(e) => handleUpdateNode({
                              nlpConfig: {
                                ...selectedNode.nlpConfig!,
                                keywordScoring: {
                                  ...selectedNode.nlpConfig!.keywordScoring,
                                  requiredKeywords: e.target.value.split(',').map(k => k.trim())
                                }
                              }
                            })}
                          />
                        </div>

                        <Separator />

                        {/* NLP Confidence Threshold */}
                        <div className="space-y-2">
                          <Label>NLP Confidence Threshold: {selectedNode.nlpConfig?.confidenceThreshold || 75}%</Label>
                          <Slider
                            value={[selectedNode.nlpConfig?.confidenceThreshold || 75]}
                            onValueChange={(values) => handleUpdateNode({
                              nlpConfig: {
                                ...selectedNode.nlpConfig!,
                                confidenceThreshold: values[0]
                              }
                            })}
                            min={50}
                            max={100}
                            step={5}
                          />
                          <p className="text-xs text-gray-500">
                            Minimum confidence level required for NLP analysis
                          </p>
                        </div>

                        <Separator />

                        {/* Multi-Language Support */}
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <Label className="flex items-center gap-2">
                              <Globe className="size-4" />
                              Multi-Language Support
                            </Label>
                            <Switch
                              checked={selectedNode.nlpConfig?.multiLanguage.enabled || false}
                              onCheckedChange={(checked) => handleUpdateNode({
                                nlpConfig: {
                                  ...selectedNode.nlpConfig!,
                                  multiLanguage: {
                                    ...selectedNode.nlpConfig!.multiLanguage,
                                    enabled: checked
                                  }
                                }
                              })}
                            />
                          </div>

                          {selectedNode.nlpConfig?.multiLanguage.enabled && (
                            <div className="space-y-2">
                              <Label className="text-xs">Supported Languages</Label>
                              <div className="flex flex-wrap gap-2">
                                {['English-US', 'English-PH', 'Spanish', 'Tagalog'].map((lang) => (
                                  <Badge
                                    key={lang}
                                    variant={selectedNode.nlpConfig?.multiLanguage.languages.includes(lang) ? 'default' : 'outline'}
                                    className="cursor-pointer"
                                    onClick={() => {
                                      const current = selectedNode.nlpConfig?.multiLanguage.languages || [];
                                      const updated = current.includes(lang)
                                        ? current.filter(l => l !== lang)
                                        : [...current, lang];
                                      handleUpdateNode({
                                        nlpConfig: {
                                          ...selectedNode.nlpConfig!,
                                          multiLanguage: {
                                            ...selectedNode.nlpConfig!.multiLanguage,
                                            languages: updated
                                          }
                                        }
                                      });
                                    }}
                                  >
                                    {lang}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        <Separator />

                        {/* Global ASR Settings */}
                        <div className="space-y-3">
                          <Label className="flex items-center gap-2">
                            <Settings className="size-4" />
                            ASR Settings
                          </Label>

                          <div className="space-y-2">
                            <Label className="text-xs">ASR Sensitivity: {selectedNode.nlpConfig?.asrSettings.sensitivity || 80}%</Label>
                            <Slider
                              value={[selectedNode.nlpConfig?.asrSettings.sensitivity || 80]}
                              onValueChange={(values) => handleUpdateNode({
                                nlpConfig: {
                                  ...selectedNode.nlpConfig!,
                                  asrSettings: {
                                    ...selectedNode.nlpConfig!.asrSettings,
                                    sensitivity: values[0]
                                  }
                                }
                              })}
                              min={50}
                              max={100}
                              step={5}
                            />
                          </div>

                          <div className="flex items-center justify-between">
                            <Label className="text-xs">Background Noise Filter</Label>
                            <Switch
                              checked={selectedNode.nlpConfig?.asrSettings.backgroundNoiseFilter || false}
                              onCheckedChange={(checked) => handleUpdateNode({
                                nlpConfig: {
                                  ...selectedNode.nlpConfig!,
                                  asrSettings: {
                                    ...selectedNode.nlpConfig!.asrSettings,
                                    backgroundNoiseFilter: checked
                                  }
                                }
                              })}
                            />
                          </div>
                        </div>
                      </div>
                    </>
                  )}

                  {/* Copy Node */}
                  <Separator />
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      const newNode = {
                        ...selectedNode,
                        id: `node-${Date.now()}`,
                        position: {
                          x: selectedNode.position.x + 50,
                          y: selectedNode.position.y + 50
                        }
                      };
                      setNodes([...nodes, newNode]);
                      toast.success('Node duplicated');
                    }}
                  >
                    <Copy className="size-4 mr-2" />
                    Duplicate Node
                  </Button>
                </div>
              </ScrollArea>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
