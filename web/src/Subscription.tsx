import { useEffect, useState } from 'react';
import {
  ArrowRight,
  Check,
  ChevronDown,
  CircleCheck,
  CreditCard,
  LoaderCircle,
  Sparkles,
} from 'lucide-react';
import { api, put } from './api';
import { getLocale } from './i18n';
import type { Subscription as SubscriptionData } from './types';

const currency = (value: number) => new Intl.NumberFormat(getLocale(), { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value);
export default function Subscription({ notify }: { notify: (message: string) => void }) {
  const [data, setData] = useState<SubscriptionData | null>(null);
  const [cycle, setCycle] = useState<'monthly' | 'annual'>('monthly');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    api<SubscriptionData>('/subscription')
      .then((d) => {
        setData(d);
        setCycle(d.billing_cycle);
      })
      .catch((e) => setError(e.message));
  }, []);
  async function choose(code: string) {
    setBusy(code);
    setError('');
    try {
      const result = await put<SubscriptionData>('/subscription/demo', {
        plan_code: code,
        billing_cycle: cycle,
      });
      setData(result);
      notify('Demo plan updated. No payment was made.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to change plan.');
    } finally {
      setBusy('');
    }
  }
  return (
    <>
      <div className="page-intro">
        <div>
          <span className="eyebrow">SUBSCRIPTION</span>
          <h1>
            More perspective.
            <br className="mobile-only" /> More control.
          </h1>
          <p>Find a plan for the way you invest. Start free, upgrade when needed.</p>
        </div>
        <span className="demo-outline">
          <CreditCard size={15} />
          Illustrative pricing
        </span>
      </div>
      {error && <div className="inline-error">{error}</div>}
      <div className="current-plan">
        <span className="current-plan-icon">
          <CircleCheck size={24} />
        </span>
        <div>
          <span className="micro-label">YOUR PLAN</span>
          <strong>
            {data?.plans.find((p) => p.code === data.plan_code)?.name || '…'} ·{' '}
            {data?.plan_code === 'free' ? 'No cost' : 'Simulated'}
          </strong>
          <span>{data?.portfolio_count ?? 0} active portfolios in your workspace.</span>
        </div>
        <span className="tag">ALL TOOLS AVAILABLE IN DEMO</span>
      </div>
      <div className="billing-switch">
        <div className="segmented">
          <button
            className={cycle === 'monthly' ? 'active' : ''}
            onClick={() => setCycle('monthly')}
          >
            Monthly
          </button>
          <button className={cycle === 'annual' ? 'active' : ''} onClick={() => setCycle('annual')}>
            Yearly
          </button>
        </div>
        <span className="saving-tag">Save 20%</span>
      </div>
      <div className="plans-grid">
        {data?.plans.map((plan) => (
          <section
            className={'plan-card ' + (plan.code === 'plus' ? 'featured' : '')}
            key={plan.code}
          >
            <div className="plan-card-top">
              <h2>{plan.name}</h2>
              {plan.code === 'plus' && (
                <span className="saving-tag">
                  <Sparkles size={11} />
                  POPULAR
                </span>
              )}
            </div>
            <p>
              {plan.code === 'free'
                ? 'Start with insight.'
                : plan.code === 'plus'
                  ? 'Know your portfolio.'
                  : 'See the full picture.'}
            </p>
            <div className="plan-price">
              {currency(
                cycle === 'monthly'
                  ? plan.monthly_price
                  : Math.round(plan.monthly_price * 12 * 0.8),
              )}
              <span>/{cycle === 'monthly' ? 'month' : 'year'}</span>
            </div>
            <span className="plan-price-note">
              {cycle === 'annual' && plan.monthly_price > 0
                ? 'Equivalent to' + currency(Math.round(plan.monthly_price * 0.8)) + '/month'
                : 'Illustrative pricing · VND'}
            </span>
            <div className="plan-features">
              {[
                plan.portfolios + ' portfolios',
                plan.history_years
                  ? plan.history_years + ' years of historical data'
                  : 'All available history',
                plan.code === 'free'
                  ? 'Overview and basic risk'
                  : 'Signals, backtests, and factors',
                plan.layouts == null
                  ? 'Unlimited Studio layouts'
                  : plan.layouts === 0
                    ? 'Standard layout'
                    : 'Studio: save ' + plan.layouts + ' layouts',
              ].map((text) => (
                <span key={text}>
                  <Check size={15} />
                  {text}
                </span>
              ))}
            </div>
            <button
              className={'button full ' + (plan.code === 'plus' ? 'lime' : 'outline')}
              disabled={!!busy || (data.plan_code === plan.code && data.billing_cycle === cycle)}
              onClick={() => void choose(plan.code)}
            >
              {busy === plan.code ? <LoaderCircle size={15} className="spin" /> : null}
              {data.plan_code === plan.code && data.billing_cycle === cycle
                ? 'Current plan'
                : 'Choose' + plan.name}
              <ArrowRight size={15} />
            </button>
          </section>
        ))}
      </div>
      <div className="subscription-note">
        <Sparkles size={17} />
        <p>{data?.notice || 'Illustrative pricing and benefits. No actual payments.'}</p>
      </div>
      <section className="comparison-section">
        <span className="eyebrow">COMPARE PLANS</span>
        <h2>Choose the support you need.</h2>
        <span className="comparison-scroll-hint">Swipe to compare all plans →</span>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Feature</th>
                <th>Free</th>
                <th>Plus</th>
                <th>Pro</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Portfolios</td>
                <td>1</td>
                <td>5</td>
                <td>20</td>
              </tr>
              <tr>
                <td>Historical data</td>
                <td>1 year</td>
                <td>5 years</td>
                <td>Available</td>
              </tr>
              <tr>
                <td>Signals and backtests</td>
                <td>—</td>
                <td>✓</td>
                <td>✓</td>
              </tr>
              <tr>
                <td>Factor analysis</td>
                <td>—</td>
                <td>✓</td>
                <td>✓</td>
              </tr>
              <tr>
                <td>Studio layouts</td>
                <td>Standard</td>
                <td>3</td>
                <td>Unlimited</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
      <div className="faq-section">
        <h2>Frequently asked questions.</h2>
        <div className="faq-grid">
          <details>
            <summary>
              Can I change plans at any time?
              <ChevronDown size={15} />
            </summary>
            <p>
              You can switch plans to explore the demo. No payment is made, and plan limits are not
              enforced in the demo.
            </p>
          </details>
          <details>
            <summary>
              Will I lose my portfolios if I cancel?
              <ChevronDown size={15} />
            </summary>
            <p>
              Your portfolios remain when switching to Free in the demo. Commercial policies will be
              finalized before launch.
            </p>
          </details>
        </div>
      </div>
    </>
  );
}
