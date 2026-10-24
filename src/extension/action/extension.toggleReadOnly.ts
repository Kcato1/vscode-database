import { AbstractAction } from './AbstractAction';

export class ToggleReadOnly extends AbstractAction
{
    execution() {
        this.sqlMenager.toggleReadOnly();
    }
}
