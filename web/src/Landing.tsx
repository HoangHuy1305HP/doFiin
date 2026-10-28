import { ArrowRight, ChartNoAxesCombined, ShieldCheck, TrendingUp, Layers3 } from 'lucide-react';
import { BrandHome } from './Auth';
import { TimeChart } from './charts';
const illustration = Array.from({ length: 36 }, (_, i) => ({
  date: `2025-${String(Math.floor(i / 3) + 1).padStart(2, '0')}-${String((i % 3) * 9 + 1).padStart(2, '0')}`,
  portfolio: 100 + i * 0.8 + Math.sin(i * 1.7) * 3,
  benchmark: 100 + i * 0.45 + Math.sin(i * 1.3) * 2,
}));
const planComparison = [
  { feature: 'Portfolios', values: ['1', '5', '20', 'Tailored'] },
  { feature: 'Price history', values: ['1 year', '5 years', 'Available', 'Tailored'] },
  { feature: 'Signals & backtests', values: ['—', 'Included', 'Included', 'Tailored'] },
  { feature: 'Factor analysis', values: ['—', 'Included', 'Included', 'Tailored'] },
  { feature: 'Studio layouts', values: ['Standard', '3', 'Unlimited', 'Tailored'] },
  { feature: 'Personalized workflows', values: ['—', '—', '—', 'By agreement'] },
];
export default function Landing({
  onSignIn,
  onStart,
  onExplore,
}: {
  onSignIn: () => void;
  onStart: () => void;
  onExplore: () => void;
}) {
  return (
    <div className="landing">
      <header className="landing-nav">
        <BrandHome />
        <nav aria-label="Product navigation">
          <a
            href="#product"
            onClick={(event) => {
              event.preventDefault();
              document.getElementById('product')?.scrollIntoView({ behavior: 'smooth' });
            }}
          >
            Product
          </a>
          <a
            href="#workflow"
            onClick={(event) => {
              event.preventDefault();
              document.getElementById('workflow')?.scrollIntoView({ behavior: 'smooth' });
            }}
          >
            How it works
          </a>
          <a
            href="#pricing"
            onClick={(event) => {
              event.preventDefault();
              document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' });
            }}
          >
            Pricing
          </a>
        </nav>
        <div>
          <button className="text-button" onClick={onSignIn}>
            Sign in
          </button>
          <button className="button primary" onClick={onStart}>
            Start free →
          </button>
        </div>
      </header>
      <main>
        <section className="landing-hero">
          <span className="landing-badge">CLARITY FOR EVERY INVESTMENT</span>
          <h1>
            Know your portfolio.
            <br />
            Own your next move.
          </h1>
          <p>
            Understand performance, explore risk, and test strategies.
            <br />
            One clear view of the portfolio you are building.
          </p>
          <div className="landing-actions">
            <button className="button primary" onClick={onStart}>
              Start your free portfolio →
            </button>
            <button className="button outline" onClick={onExplore}>
              Explore the product
            </button>
          </div>
          <small>Free to start. No card required.</small>
        </section>
        <div className="landing-product-preview" aria-label="Illustrative portfolio dashboard">
          <div className="landing-browser-bar">
            <i />
            <i />
            <i />
            <span>doFiin / Portfolio overview</span>
          </div>
          <div className="landing-product-body">
            <aside>
              <BrandHome light />
              {['Overview', 'Risk', 'Signals', 'Backtest', 'Factors'].map((text) => (
                <span key={text}>{text}</span>
              ))}
            </aside>
            <div className="landing-preview-content">
              <h2>Your portfolio, at a glance.</h2>
              <p>Sample portfolio · AAPL / MSFT / NVDA</p>
              <div className="landing-preview-metrics">
                {[
                  ['TOTAL RETURN', '+12.8%'],
                  ['VOLATILITY', '12.9%'],
                  ['SHARPE', '1.09'],
                ].map(([label, value]) => (
                  <div key={label}>
                    <span>{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
              <div className="landing-chart">
                <strong>Portfolio growth</strong>
                <TimeChart
                  data={illustration}
                  lines={[
                    { key: 'portfolio', name: 'Portfolio', color: '#163d32' },
                    { key: 'benchmark', name: 'Benchmark', color: '#a2b28a' },
                  ]}
                  area={false}
                  height={230}
                />
                <div className="chart-legend">
                  <span>● Portfolio</span>
                  <span>● Benchmark</span>
                  <span>Illustrative data</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        <section className="landing-section" id="product">
          <h2>The whole picture.</h2>
          <p>Five connected views. Built around your portfolio.</p>
          <div className="landing-feature-grid">
            {[
              {
                icon: ChartNoAxesCombined,
                title: 'Performance & risk',
                copy: 'Track growth, allocation, volatility, correlation, and drawdown.',
              },
              {
                icon: TrendingUp,
                title: 'Signals & backtesting',
                copy: 'Explore moving-average signals. Test rules against historical data.',
              },
              {
                icon: Layers3,
                title: 'Factors & optimization',
                copy: 'Understand exposures and compare alternative portfolio weights.',
              },
            ].map((item) => (
              <article key={item.title}>
                <item.icon size={24} />
                <h3>{item.title}</h3>
                <p>{item.copy}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="landing-section landing-workflow" id="workflow">
          <h2>From holdings to insight.</h2>
          <div className="landing-step-grid">
            {[
              ['Build your portfolio', 'Choose assets and set your weights.'],
              ['Run the analysis', 'Select a period and a benchmark.'],
              ['Explore the results', 'Compare views and test your rules.'],
            ].map(([title, copy], i) => (
              <article key={title}>
                <span>{i + 1}</span>
                <div>
                  <h3>{title}</h3>
                  <p>{copy}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
        <section className="landing-studio">
          <div>
            <span className="eyebrow">YOUR WORKSPACE, YOUR WAY</span>
            <h2>
              A clearer view.
              <br />
              Made by you.
            </h2>
            <p>
              Reorder widgets and adjust the layout.
              <br />
              Keep the analysis behind them intact.
            </p>
            <button className="button outline" onClick={onExplore}>
              Explore Studio →
            </button>
          </div>
          <div className="landing-studio-demo">
            <div className="landing-studio-title">
              doFiin / Studio<span>Save</span>
            </div>
            <div className="landing-studio-panels">
              <div>
                <span>SECTIONS</span>
                {['Overview', 'Growth', 'Allocation'].map((label) => (
                  <p key={label}>{label}</p>
                ))}
              </div>
              <div>
                <strong>Portfolio growth</strong>
                <TimeChart
                  data={illustration}
                  lines={[{ key: 'portfolio', name: 'Portfolio', color: '#163d32' }]}
                  area={false}
                  height={180}
                />
              </div>
              <div>
                <span>WIDGET SETTINGS</span>
                {[
                  ['Chart type', 'Line'],
                  ['Date range', '1 year'],
                  ['Legend', 'Visible'],
                ].map(([label, value]) => (
                  <div key={label}>
                    <p>{label}</p>
                    <span className="landing-demo-input">{value} ▾</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
        <section className="landing-section" id="pricing">
          <h2>Start simple. Grow your perspective.</h2>
          <p>Choose the space you need for your analysis.</p>
          <div className="landing-pricing-grid">
            {[
              {
                name: 'Free',
                description: 'Start with the essentials.',
                price: '0',
                billing: 'VND / month',
                features: ['1 portfolio', '1 year of price history'],
                cta: 'Get started',
              },
              {
                name: 'Plus',
                description: 'Go deeper into your portfolio.',
                price: '99,000',
                billing: 'VND / month',
                features: ['5 portfolios', 'Signals, backtests, and Studio'],
                cta: 'Choose Plus',
              },
              {
                name: 'Pro',
                description: 'Make room for more exploration.',
                price: '199,000',
                billing: 'VND / month',
                features: ['20 portfolios', 'Unlimited Studio layouts'],
                cta: 'Choose Pro',
              },
              {
                name: "Let's Talk",
                description: 'Work with our team to shape a plan around your needs.',
                price: 'Custom',
                billing: 'Pricing by agreement',
                features: ['Personalized features and workflows', 'Options tailored to your requests'],
                cta: 'Coming soon',
                comingSoon: true,
              },
            ].map((plan) => (
              <article key={plan.name} className={plan.name === 'Plus' ? 'featured' : ''}>
                <h3>{plan.name}</h3>
                {plan.name === 'Plus' && <span className="landing-popular">MOST POPULAR</span>}
                {plan.comingSoon && (
                  <span className="landing-popular landing-coming-soon">COMING SOON</span>
                )}
                <p>{plan.description}</p>
                <strong>{plan.price}</strong>
                <small>{plan.billing}</small>
                <ul>
                  {plan.features.map((f) => (
                    <li key={f}>
                      <ShieldCheck size={14} />
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  className={'button full ' + (plan.name === 'Plus' ? 'lime' : 'outline')}
                  onClick={onStart}
                  disabled={plan.comingSoon}
                >
                  {plan.cta}
                </button>
              </article>
            ))}
          </div>
          <small className="landing-price-note">
            Illustrative pricing in VND. Taxes included. Plan limits shown for design demonstration.
          </small>
        </section>
        <section className="landing-section landing-plan-comparison" aria-labelledby="plan-comparison-title">
          <span className="eyebrow">COMPARE PLANS</span>
          <h2 id="plan-comparison-title">Find the plan that fits.</h2>
          <p>See what each plan offers at a glance.</p>
          <span className="landing-comparison-hint">Swipe to compare all plans →</span>
          <div className="landing-comparison-scroll" role="region" aria-label="Plan comparison" tabIndex={0}>
            <table>
              <thead>
                <tr>
                  <th scope="col">Feature</th>
                  <th scope="col">Free</th>
                  <th scope="col">Plus</th>
                  <th scope="col">Pro</th>
                  <th scope="col">
                    Let’s Talk <span className="landing-comparison-soon">SOON</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {planComparison.map(({ feature, values }) => (
                  <tr key={feature}>
                    <th scope="row">{feature}</th>
                    {values.map((value, index) => (
                      <td key={`${feature}-${index}`} className={value === '—' ? 'unavailable' : ''}>
                        {value}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <small className="landing-price-note">
            Illustrative benefits for this demo. Let’s Talk is coming soon; its scope and pricing will be agreed with our team.
          </small>
        </section>
        <section className="landing-cta">
          <div>
            <h2>Your portfolio. A fresh perspective.</h2>
            <p>Start building a clearer picture today.</p>
          </div>
          <button className="button lime" onClick={onStart}>
            Create your free account <ArrowRight size={16} />
          </button>
        </section>
      </main>
      <footer className="landing-footer">
        <div>
          <BrandHome />
          <p>Portfolio clarity, without the noise.</p>
          <button className="text-button" onClick={onSignIn}>
            Sign in
          </button>
        </div>
        <div>
          <span>© 2026 doFiin · Research and historical analysis.</span>
          <span>Privacy · Terms</span>
        </div>
      </footer>
    </div>
  );
}
