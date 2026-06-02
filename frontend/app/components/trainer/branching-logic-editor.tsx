'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Card } from '../ui/card';
import { Badge } from '../ui/badge';
import { GitBranch, Plus, Trash2, MessageCircle, User, ArrowRight, Save } from 'lucide-react';
import { toast } from 'sonner';

type DialogueBranch = {
  condition: string;
  nextNodeId: string;
};

interface DialogueNode {
  id: string;
  speaker: 'bot' | 'agent';
  content: string;
  expectedKeywords?: string[];
  branches?: DialogueBranch[];
  parentNodeId?: string;
}

interface BranchingLogicEditorProps {
  onSave: (nodes: DialogueNode[]) => void;
}

export default function BranchingLogicEditor({ onSave }: BranchingLogicEditorProps) {
  const [open, setOpen] = useState(false);
  const [nodes, setNodes] = useState<DialogueNode[]>([
    {
      id: 'node-1',
      speaker: 'bot',
      content: 'Hello! Thank you for calling. How can I help you today?',
      branches: []
    }
  ]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>('node-1');

  const selectedNode = nodes.find(n => n.id === selectedNodeId);

  const addNode = (parentId: string, speaker: 'bot' | 'agent') => {
    const newNode: DialogueNode = {
      id: `node-${nodes.length + 1}`,
      speaker,
      content: '',
      expectedKeywords: [],
      branches: [],
      parentNodeId: parentId
    };
    
    setNodes([...nodes, newNode]);
    setSelectedNodeId(newNode.id);
    toast.success(`New ${speaker} node added`);
  };

  const updateNode = (nodeId: string, updates: Partial<DialogueNode>) => {
    setNodes(nodes.map(node => 
      node.id === nodeId ? { ...node, ...updates } : node
    ));
  };

  const deleteNode = (nodeId: string) => {
    if (nodes.length === 1) {
      toast.error('Cannot delete the last node');
      return;
    }
    
    setNodes(nodes.filter(node => node.id !== nodeId));
    setSelectedNodeId(nodes[0].id);
    toast.success('Node deleted');
  };

  const addBranch = (nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId);
    if (node) {
      updateNode(nodeId, {
        branches: [
          ...(node.branches || []),
          { condition: '', nextNodeId: '' }
        ]
      });
    }
  };

  const updateBranch = (nodeId: string, branchIndex: number, updates: Partial<DialogueBranch>) => {
    const node = nodes.find(n => n.id === nodeId);
    if (node && node.branches) {
      const updatedBranches = [...node.branches];
      updatedBranches[branchIndex] = { ...updatedBranches[branchIndex], ...updates };
      updateNode(nodeId, { branches: updatedBranches });
    }
  };

  const removeBranch = (nodeId: string, branchIndex: number) => {
    const node = nodes.find(n => n.id === nodeId);
    if (node && node.branches) {
      updateNode(nodeId, {
        branches: node.branches.filter((_, i) => i !== branchIndex)
      });
    }
  };

  const handleSave = () => {
    onSave(nodes);
    toast.success('Branching logic saved successfully');
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <GitBranch className="size-4 mr-2" />
          Edit Branching Logic
        </Button>
      </DialogTrigger>
      <DialogContent size="xl" className="max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Tree Structure Branching Editor</DialogTitle>
          <DialogDescription>
            Create parent-child logic with conditional branching based on agent responses
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 flex gap-6 overflow-hidden">
          {/* Flow Visualization Panel */}
          <div className="flex-1 border rounded-lg p-4 overflow-y-auto">
            <div className="mb-4 flex items-center justify-between">
              <h4 className="text-sm">Dialogue Flow ({nodes.length} nodes)</h4>
              <Button size="sm" onClick={() => addNode('node-1', 'agent')}>
                <Plus className="size-3 mr-1" />
                Add Node
              </Button>
            </div>
            
            <div className="space-y-3">
              {nodes.map((node, index) => (
                <div key={node.id}>
                  <Card 
                    className={`p-3 cursor-pointer transition-all ${
                      selectedNodeId === node.id 
                        ? 'border-2 border-blue-600 bg-blue-50 dark:bg-blue-900/20' 
                        : 'hover:border-blue-300'
                    }`}
                    onClick={() => setSelectedNodeId(node.id)}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {node.speaker === 'bot' ? (
                          <div className="p-1.5 bg-purple-100 dark:bg-purple-900/30 rounded">
                            <MessageCircle className="size-3.5 text-purple-600" />
                          </div>
                        ) : (
                          <div className="p-1.5 bg-green-100 dark:bg-green-900/30 rounded">
                            <User className="size-3.5 text-green-600" />
                          </div>
                        )}
                        <div>
                          <Badge variant={node.speaker === 'bot' ? 'secondary' : 'outline'} className="text-xs">
                            {node.speaker === 'bot' ? 'Customer' : 'Agent'}
                          </Badge>
                          <p className="text-xs text-gray-500 mt-1">{node.id}</p>
                        </div>
                      </div>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteNode(node.id);
                        }}
                      >
                        <Trash2 className="size-3 text-red-600" />
                      </Button>
                    </div>
                    
                    <p className="text-sm line-clamp-2">
                      {node.content || <span className="text-gray-400 italic">No content</span>}
                    </p>
                    
                    {node.branches && node.branches.length > 0 && (
                      <div className="mt-2 pt-2 border-t">
                        <div className="flex items-center gap-1 text-xs text-blue-600">
                          <GitBranch className="size-3" />
                          {node.branches.length} branch{node.branches.length > 1 ? 'es' : ''}
                        </div>
                      </div>
                    )}
                  </Card>
                  
                  {index < nodes.length - 1 && (
                    <div className="flex justify-center py-1">
                      <ArrowRight className="size-4 text-gray-400 rotate-90" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Node Editor Panel */}
          <div className="w-[400px] border rounded-lg p-4 overflow-y-auto space-y-4">
            {selectedNode ? (
              <>
                <div>
                  <h4 className="mb-3">Edit Node: {selectedNode.id}</h4>
                  
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label>Speaker</Label>
                      <select
                        className="w-full px-3 py-2 border rounded-md"
                        value={selectedNode.speaker}
                        onChange={(e) => updateNode(selectedNode.id, { speaker: e.target.value as 'bot' | 'agent' })}
                      >
                        <option value="bot">Customer/Bot</option>
                        <option value="agent">Agent</option>
                      </select>
                    </div>

                    <div className="space-y-2">
                      <Label>Dialogue Content</Label>
                      <Textarea
                        placeholder="Enter what the speaker says..."
                        value={selectedNode.content}
                        onChange={(e) => updateNode(selectedNode.id, { content: e.target.value })}
                        rows={4}
                      />
                    </div>

                    {selectedNode.speaker === 'agent' && (
                      <div className="space-y-2">
                        <Label>Expected Keywords (comma-separated)</Label>
                        <Input
                          placeholder="e.g., sorry, apologize, understand"
                          value={selectedNode.expectedKeywords?.join(', ') || ''}
                          onChange={(e) => updateNode(selectedNode.id, {
                            expectedKeywords: e.target.value.split(',').map(k => k.trim()).filter(k => k)
                          })}
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Branching Logic */}
                <div className="border-t pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <Label>Branching Logic</Label>
                    <Button size="sm" variant="outline" onClick={() => addBranch(selectedNode.id)}>
                      <Plus className="size-3 mr-1" />
                      Add Branch
                    </Button>
                  </div>

                  {selectedNode.branches && selectedNode.branches.length > 0 ? (
                    <div className="space-y-3">
                      {selectedNode.branches.map((branch, index) => (
                        <Card key={index} className="p-3 bg-gray-50 dark:bg-gray-900">
                          <div className="space-y-2">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs">Branch {index + 1}</span>
                              <Button 
                                variant="ghost" 
                                size="sm"
                                onClick={() => removeBranch(selectedNode.id, index)}
                              >
                                <Trash2 className="size-3 text-red-600" />
                              </Button>
                            </div>
                            
                            <div className="space-y-1">
                              <Label className="text-xs">If agent says:</Label>
                              <Input
                                placeholder="e.g., 'I can help with that'"
                                value={branch.condition}
                                onChange={(e) => updateBranch(selectedNode.id, index, { condition: e.target.value })}
                                className="text-xs"
                              />
                            </div>
                            
                            <div className="space-y-1">
                              <Label className="text-xs">Go to node:</Label>
                              <select
                                className="w-full px-2 py-1 text-xs border rounded"
                                value={branch.nextNodeId}
                                onChange={(e) => updateBranch(selectedNode.id, index, { nextNodeId: e.target.value })}
                              >
                                <option value="">Select node...</option>
                                {nodes.filter(n => n.id !== selectedNode.id).map(n => (
                                  <option key={n.id} value={n.id}>{n.id}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-500 text-center py-4">
                      No branches defined. Click "Add Branch" to create conditional logic.
                    </p>
                  )}
                </div>

                {/* Quick Actions */}
                <div className="border-t pt-4 space-y-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full"
                    onClick={() => addNode(selectedNode.id, 'bot')}
                  >
                    <Plus className="size-3 mr-1" />
                    Add Customer Response After
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full"
                    onClick={() => addNode(selectedNode.id, 'agent')}
                  >
                    <Plus className="size-3 mr-1" />
                    Add Agent Response After
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-sm text-gray-500 text-center py-8">
                Select a node to edit
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between pt-4 border-t">
          <div className="text-xs text-gray-500">
            <p> Tip: Use branching to create different conversation paths based on agent responses</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave}>
              <Save className="size-4 mr-2" />
              Save Flow
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
