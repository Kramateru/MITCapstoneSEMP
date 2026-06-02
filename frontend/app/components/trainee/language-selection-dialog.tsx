'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { Globe, Check } from 'lucide-react';
import { toast } from 'sonner';

interface LanguageSelectionDialogProps {
  open: boolean;
  onSelect: (language: string) => void;
}

const languages = [
  { code: 'en-US', name: 'English - United States', flag: '', accent: 'American' },
  { code: 'en-GB', name: 'English - United Kingdom', flag: '', accent: 'British' },
  { code: 'en-PH', name: 'English - Philippines', flag: '', accent: 'Filipino' },
  { code: 'en-IN', name: 'English - India', flag: '', accent: 'Indian' },
  { code: 'en-AU', name: 'English - Australia', flag: '', accent: 'Australian' },
  { code: 'en-CA', name: 'English - Canada', flag: '', accent: 'Canadian' },
];

export default function LanguageSelectionDialog({ open, onSelect }: LanguageSelectionDialogProps) {
  const [selectedLanguage, setSelectedLanguage] = useState<string>('');

  const handleConfirm = () => {
    if (selectedLanguage) {
      onSelect(selectedLanguage);
      toast.success('Language preference saved successfully');
    } else {
      toast.error('Please select a language dialect');
    }
  };

  return (
    <Dialog open={open}>
      <DialogContent size="sm" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <Globe className="size-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <DialogTitle>Select Your Primary Language Dialect</DialogTitle>
              <DialogDescription>
                Choose your accent to calibrate the speech recognition engine for optimal accuracy
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
            <h4 className="text-sm mb-2">Important:</h4>
            <ul className="text-xs space-y-1 text-gray-600 dark:text-gray-400">
              <li>- This setting calibrates the ASR (Automatic Speech Recognition) to your accent</li>
              <li>- You can change this later in your profile settings if your project requirements change</li>
              <li>- Select the dialect that best matches your natural speaking accent</li>
            </ul>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {languages.map((lang) => (
              <Card
                key={lang.code}
                className={`p-4 cursor-pointer transition-all ${
                  selectedLanguage === lang.code
                    ? 'border-2 border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-2 border-gray-200 hover:border-blue-300'
                }`}
                onClick={() => setSelectedLanguage(lang.code)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="text-3xl">{lang.flag}</div>
                    <div>
                      <h3 className="text-base mb-1">{lang.name}</h3>
                      <p className="text-sm text-gray-500">{lang.accent} Accent</p>
                      <p className="text-xs text-gray-400 mt-1">{lang.code}</p>
                    </div>
                  </div>
                  {selectedLanguage === lang.code && (
                    <div className="p-1 bg-blue-600 rounded-full">
                      <Check className="size-4 text-white" />
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button 
            onClick={handleConfirm}
            disabled={!selectedLanguage}
            className="px-6"
          >
            Confirm Selection
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
