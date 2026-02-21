import React, { useState } from 'react';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input, Textarea } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { Dropdown } from '../components/ui/Dropdown';
import { Toggle } from '../components/ui/Toggle';
import { Tabs } from '../components/ui/Tabs';
import { ProgressBar } from '../components/ui/ProgressBar';
import { Skeleton, SkeletonCard, SkeletonTable } from '../components/ui/Skeleton';
import { Modal } from '../components/ui/Modal';
import { Download, Search, Heart, AlertCircle, CheckCircle2, Info } from 'lucide-react';
import { useToast } from '../components/ui/Toast';

export function DesignSystem() {
  const [activeTab, setActiveTab] = useState('buttons');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [toggleValue, setToggleValue] = useState(false);
  const [dropdownValue, setDropdownValue] = useState('');
  const { showToast } = useToast();

  return (
    <div className="space-y-8">
      <div>
        <h1>Design System</h1>
        <p className="text-[rgb(var(--color-muted-foreground))] mt-1">
          Comprehensive component library and style guide
        </p>
      </div>

      <Tabs
        tabs={[
          { id: 'buttons', label: 'Buttons' },
          { id: 'inputs', label: 'Inputs' },
          { id: 'badges', label: 'Badges & Pills' },
          { id: 'cards', label: 'Cards' },
          { id: 'feedback', label: 'Feedback' },
        ]}
        activeTab={activeTab}
        onChange={setActiveTab}
      />

      {/* Buttons */}
      {activeTab === 'buttons' && (
        <div className="space-y-6">
          <Card>
            <CardHeader title="Button Variants" description="Primary, secondary, ghost, outline, and destructive styles" />
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium mb-3">Standard Variants</p>
                <div className="flex gap-3">
                  <Button variant="primary">Primary Button</Button>
                  <Button variant="secondary">Secondary Button</Button>
                  <Button variant="ghost">Ghost Button</Button>
                  <Button variant="outline">Outline Button</Button>
                  <Button variant="destructive">Destructive Button</Button>
                </div>
              </div>
              <div>
                <p className="text-sm font-medium mb-3">With Icons</p>
                <div className="flex gap-3">
                  <Button variant="primary">
                    <Download className="w-4 h-4" />
                    Download
                  </Button>
                  <Button variant="secondary">
                    <Search className="w-4 h-4" />
                    Search
                  </Button>
                  <Button variant="ghost">
                    <Heart className="w-4 h-4" />
                    Like
                  </Button>
                </div>
              </div>
              <div>
                <p className="text-sm font-medium mb-3">Sizes</p>
                <div className="flex items-center gap-3">
                  <Button variant="primary" size="sm">Small</Button>
                  <Button variant="primary" size="md">Medium</Button>
                  <Button variant="primary" size="lg">Large</Button>
                </div>
              </div>
              <div>
                <p className="text-sm font-medium mb-3">States</p>
                <div className="flex gap-3">
                  <Button variant="primary" loading>Loading</Button>
                  <Button variant="primary" disabled>Disabled</Button>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Inputs */}
      {activeTab === 'inputs' && (
        <div className="space-y-6">
          <Card>
            <CardHeader title="Form Inputs" description="Text inputs, textareas, dropdowns, and toggles" />
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <Input label="Text Input" placeholder="Enter text..." />
                <Input label="With Icon" placeholder="Search..." icon={<Search className="w-4 h-4" />} />
              </div>
              <Input label="With Error" error="This field is required" placeholder="Enter value..." />
              <Textarea label="Textarea" placeholder="Enter long text..." rows={4} />
              <Dropdown
                label="Dropdown"
                options={[
                  { value: '1', label: 'Option 1' },
                  { value: '2', label: 'Option 2' },
                  { value: '3', label: 'Option 3' },
                ]}
                value={dropdownValue}
                onChange={setDropdownValue}
                placeholder="Select an option..."
              />
              <Toggle checked={toggleValue} onChange={setToggleValue} label="Toggle Switch" />
            </div>
          </Card>
        </div>
      )}

      {/* Badges */}
      {activeTab === 'badges' && (
        <div className="space-y-6">
          <Card>
            <CardHeader title="Badges & Status Pills" description="Various badge styles for labels and status indicators" />
            <div className="space-y-6">
              <div>
                <p className="text-sm font-medium mb-3">Status Badges</p>
                <div className="flex gap-2 flex-wrap">
                  <Badge variant="success">Success</Badge>
                  <Badge variant="warning">Warning</Badge>
                  <Badge variant="error">Error</Badge>
                  <Badge variant="default">Default</Badge>
                  <Badge variant="primary">Primary</Badge>
                  <Badge variant="secondary">Secondary</Badge>
                </div>
              </div>
              <div>
                <p className="text-sm font-medium mb-3">Sentiment Badges</p>
                <div className="flex gap-2">
                  <Badge variant="positive">
                    <CheckCircle2 className="w-3 h-3" />
                    Positive
                  </Badge>
                  <Badge variant="neutral">Neutral</Badge>
                  <Badge variant="negative">
                    <AlertCircle className="w-3 h-3" />
                    Negative
                  </Badge>
                </div>
              </div>
              <div>
                <p className="text-sm font-medium mb-3">Skill Tags</p>
                <div className="flex gap-2 flex-wrap">
                  <Badge variant="primary" size="sm">VIP</Badge>
                  <Badge variant="primary" size="sm">KZ</Badge>
                  <Badge variant="primary" size="sm">RU</Badge>
                  <Badge variant="primary" size="sm">ENG</Badge>
                </div>
              </div>
              <div>
                <p className="text-sm font-medium mb-3">Priority Pills</p>
                <div className="flex gap-2">
                  <div className="inline-flex items-center justify-center w-10 h-10 rounded-full text-sm font-bold bg-red-500 text-white">10</div>
                  <div className="inline-flex items-center justify-center w-10 h-10 rounded-full text-sm font-bold bg-amber-500 text-white">7</div>
                  <div className="inline-flex items-center justify-center w-10 h-10 rounded-full text-sm font-bold bg-blue-500 text-white">5</div>
                  <div className="inline-flex items-center justify-center w-10 h-10 rounded-full text-sm font-bold bg-gray-400 text-white">2</div>
                </div>
              </div>
              <div>
                <p className="text-sm font-medium mb-3">Sizes</p>
                <div className="flex gap-2 items-center">
                  <Badge variant="primary" size="sm">Small</Badge>
                  <Badge variant="primary" size="md">Medium</Badge>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Cards */}
      {activeTab === 'cards' && (
        <div className="space-y-6">
          <Card>
            <CardHeader title="Card Components" description="Container layouts with various configurations" />
            <div className="space-y-4">
              <p className="text-sm text-[rgb(var(--color-muted-foreground))]">
                Basic card component with rounded corners, border, and shadow
              </p>
            </div>
          </Card>

          <div className="grid grid-cols-2 gap-6">
            <Card>
              <CardHeader title="Card with Header" description="Includes title and description" />
              <p className="text-sm text-[rgb(var(--color-muted-foreground))]">
                This is the card body content. Cards can contain any type of content.
              </p>
            </Card>

            <Card>
              <CardHeader 
                title="Card with Action" 
                description="Header with action button"
                action={<Button variant="ghost" size="sm">Action</Button>}
              />
              <p className="text-sm text-[rgb(var(--color-muted-foreground))]">
                Cards can have action buttons in the header for quick access to functionality.
              </p>
            </Card>
          </div>
        </div>
      )}

      {/* Feedback */}
      {activeTab === 'feedback' && (
        <div className="space-y-6">
          <Card>
            <CardHeader title="Progress Bars" description="Visual indicators for loading and progress" />
            <div className="space-y-4">
              <ProgressBar value={75} variant="default" showLabel label="Default Progress" />
              <ProgressBar value={90} variant="success" showLabel label="Success Progress" />
              <ProgressBar value={50} variant="warning" showLabel label="Warning Progress" />
              <ProgressBar value={25} variant="error" showLabel label="Error Progress" />
            </div>
          </Card>

          <Card>
            <CardHeader title="Toast Notifications" description="Temporary feedback messages" />
            <div className="flex gap-3">
              <Button variant="primary" onClick={() => showToast('Success! Operation completed.', 'success')}>
                <CheckCircle2 className="w-4 h-4" />
                Success Toast
              </Button>
              <Button variant="destructive" onClick={() => showToast('Error! Something went wrong.', 'error')}>
                <AlertCircle className="w-4 h-4" />
                Error Toast
              </Button>
              <Button variant="secondary" onClick={() => showToast('Warning! Please review your input.', 'warning')}>
                <AlertCircle className="w-4 h-4" />
                Warning Toast
              </Button>
              <Button variant="ghost" onClick={() => showToast('Info: New update available.', 'info')}>
                <Info className="w-4 h-4" />
                Info Toast
              </Button>
            </div>
          </Card>

          <Card>
            <CardHeader title="Modal Dialog" description="Overlay windows for focused interactions" />
            <Button variant="primary" onClick={() => setIsModalOpen(true)}>
              Open Modal
            </Button>
          </Card>

          <Card>
            <CardHeader title="Skeleton Loaders" description="Loading state placeholders" />
            <div className="space-y-6">
              <div>
                <p className="text-sm font-medium mb-3">Basic Skeletons</p>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-5/6" />
                  <Skeleton className="h-4 w-4/6" />
                </div>
              </div>
              <div>
                <p className="text-sm font-medium mb-3">Skeleton Card</p>
                <SkeletonCard />
              </div>
              <div>
                <p className="text-sm font-medium mb-3">Skeleton Table</p>
                <SkeletonTable rows={3} />
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Error States" description="Error banners and alerts" />
            <div className="space-y-3">
              <div className="p-4 rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-red-900 dark:text-red-200">Order Error / Ошибка отправки приказа</p>
                  <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                    Failed to process request. Error code: <code className="font-mono bg-red-100 dark:bg-red-900 px-1 rounded">order_error</code>
                  </p>
                  <div className="flex gap-2 mt-3">
                    <Button variant="destructive" size="sm">View Details</Button>
                    <Button variant="outline" size="sm">Try Again</Button>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-amber-900 dark:text-amber-200">Warning: Validation Required</p>
                  <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                    Some fields need your attention before proceeding.
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/20 flex items-start gap-3">
                <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-blue-900 dark:text-blue-200">Information</p>
                  <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                    This is an informational message for the user.
                  </p>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Demo Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Example Modal"
        size="md"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => setIsModalOpen(false)}>Confirm</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-[rgb(var(--color-muted-foreground))]">
            This is a modal dialog example. Modals are great for focused interactions that require user attention.
          </p>
          <Input label="Example Input" placeholder="Enter something..." />
          <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800">
            <p className="text-sm text-blue-900 dark:text-blue-200">
              Modals can contain any content including forms, alerts, and actions.
            </p>
          </div>
        </div>
      </Modal>
    </div>
  );
}
