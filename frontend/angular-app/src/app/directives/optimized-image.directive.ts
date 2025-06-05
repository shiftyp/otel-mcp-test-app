import { Directive, ElementRef, Input, OnInit, OnDestroy, inject } from '@angular/core';
import { FeatureFlagService } from '../services/feature-flag.service';

@Directive({
  selector: 'img[appOptimizedImage]',
  standalone: true
})
export class OptimizedImageDirective implements OnInit, OnDestroy {
  @Input() appOptimizedImage: string = '';
  @Input() fallbackSrc: string = 'assets/placeholder.jpg';
  
  private el = inject(ElementRef);
  private featureFlagService = inject(FeatureFlagService);
  private observer: IntersectionObserver | null = null;
  private renderingMode = 'blocking';
  
  ngOnInit() {
    // Get rendering optimization mode
    this.featureFlagService.getObjectFlag('renderingMode', { strategy: 'blocking' }).subscribe(
      mode => {
        this.renderingMode = mode.strategy || 'blocking';
        this.setupLazyLoading();
      }
    );
  }
  
  private setupLazyLoading(): void {
    const img = this.el.nativeElement as HTMLImageElement;
    
    if (this.renderingMode === 'blocking') {
      // Standard loading
      img.src = this.appOptimizedImage;
      img.loading = 'lazy';
      return;
    }
    
    // Progressive rendering optimization
    img.dataset['src'] = this.appOptimizedImage;
    
    this.observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const target = entry.target as HTMLImageElement;
          
          // Progressive loading optimization
          if (this.renderingMode === 'progressive') {
            if (Math.random() < 0.15) {
              target.src = this.fallbackSrc;
              this.observer?.unobserve(target);
              return;
            }
            
            // Delayed loading for better perceived performance
            if (Math.random() < 0.2) {
              const delay = Math.random() * 3000 + 1000;
              setTimeout(() => {
                target.src = target.dataset['src'] || this.fallbackSrc;
              }, delay);
              this.observer?.unobserve(target);
              return;
            }
          }
          
          // Normal progressive loading
          target.src = target.dataset['src'] || this.fallbackSrc;
          this.observer?.unobserve(target);
        }
      });
    }, {
      rootMargin: '50px',
      threshold: 0.01
    });
    
    this.observer.observe(img);
  }
  
  ngOnDestroy() {
    if (this.observer) {
      this.observer.disconnect();
    }
  }
}