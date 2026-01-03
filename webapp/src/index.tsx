// webapp/src/index.tsx

import manifest from 'manifest';

interface ReadReceipt {
    read: boolean;
}

export default class Plugin {
    private pluginId = manifest.id;
    private readCache = new Map<string, boolean>();

    public async initialize() {
        // Set up observers after DOM is ready
        this.setupPostReadTracking();
    }

    private setupPostReadTracking() {
        // Wait for initial posts to render
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                this.initializeObservers();
            });
        } else {
            this.initializeObservers();
        }
    }

    private initializeObservers() {
        // IntersectionObserver to detect visible posts
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        const postElement = entry.target as HTMLElement;
                        const postId = this.extractPostId(postElement);

                        if (postId && !this.readCache.has(postId)) {
                            this.markPostAsRead(postId);
                            this.displayReadIndicator(postElement, postId);
                        }
                    }
                });
            },
            {threshold: 0.5},
        );

        // Observe existing posts
        document.querySelectorAll('[data-testid^="post_"]').forEach((post) => {
            observer.observe(post);
        });

        // Watch for new posts added dynamically
        const mutationObserver = new MutationObserver(() => {
            document.querySelectorAll('[data-testid^="post_"]:not([data-read-observer])').forEach((post) => {
                (post as HTMLElement).setAttribute('data-read-observer', 'true');
                observer.observe(post);
            });
        });

        const postList = document.querySelector('[data-testid="post-list"]');
        if (postList) {
            mutationObserver.observe(postList, {
                childList: true,
                subtree: true,
            });
        }
    }

    private extractPostId(element: HTMLElement): string | null {
        // Mattermost post IDs are usually in data-testid like "post_abc123"
        const testId = element.getAttribute('data-testid');
        if (testId?.startsWith('post_')) {
            return testId.substring(5); // Remove "post_" prefix
        }

        // Fallback: check for post ID in element
        const postIdAttr = element.getAttribute('data-post-id');
        return postIdAttr;
    }

    private async markPostAsRead(postId: string): Promise<void> {
        try {
            const response = await fetch(
                `/plugins/${this.pluginId}/api/read?post_id=${encodeURIComponent(postId)}`,
                {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                },
            );

            if (response.ok) {
                this.readCache.set(postId, true);
            }
        } catch (error) {
            return;
        }
    }

    private async displayReadIndicator(element: HTMLElement, postId: string): Promise<void> {
        try {
            // Check if already read on server
            const isRead = await this.checkPostRead(postId);

            if (isRead) {
                this.addReadBadge(element);
            }
        } catch (error) {
            return;
        }
    }

    private async checkPostRead(postId: string): Promise<boolean> {
        // Check cache first
        if (this.readCache.has(postId)) {
            return this.readCache.get(postId)!;
        }

        try {
            const response = await fetch(
                `/plugins/${this.pluginId}/api/isread?post_id=${encodeURIComponent(postId)}`,
                {
                    credentials: 'same-origin',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                },
            );

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data: ReadReceipt = await response.json();
            this.readCache.set(postId, data.read);
            return data.read;
        } catch (error) {
            return false;
        }
    }

    private addReadBadge(element: HTMLElement): void {
        // Check if badge already exists
        if (element.querySelector('[data-read-receipt]')) {
            return;
        }

        const badge = document.createElement('div');
        badge.setAttribute('data-read-receipt', 'true');
        badge.style.cssText = `
            position: absolute;
            bottom: 8px;
            right: 8px;
            background-color: #31a24c;
            color: white;
            border-radius: 50%;
            width: 20px;
            height: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            font-weight: bold;
            z-index: 1;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        `;
        badge.textContent = '✓';

        // Make parent relative for positioning
        if (element.style.position === 'static') {
            element.style.position = 'relative';
        }

        element.appendChild(badge);
    }
}

declare global {
    interface Window {
        registerPlugin(pluginId: string, plugin: Plugin): void;
    }
}

window.registerPlugin(manifest.id, new Plugin());
