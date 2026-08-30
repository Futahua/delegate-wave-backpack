import { useState } from 'react';
import { fixtureCases, watchFixtures } from './fixtures';
import { Watch } from './Watch';

export function FixtureLab(): React.JSX.Element {
  const requested = new URLSearchParams(window.location.search).get('case');
  const [selected, setSelected] = useState(requested && requested in watchFixtures ? requested : 'success');
  return <div className="fixture-lab"><nav aria-label="Fixture cases"><strong>Fixture lab</strong>{fixtureCases.map((name) => <button className={selected === name ? 'selected' : ''} key={name} onClick={() => setSelected(name)}>{name}</button>)}</nav><Watch fixture={watchFixtures[selected] ?? watchFixtures.success!}/></div>;
}
