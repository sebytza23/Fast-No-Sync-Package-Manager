const managers = 'npm yarn pnpm bun deno';
const candidates: Record<string, string> = {
    root: '--info --why --completion --help --version --pm --debug help initialize init-config doctor migrate restore config install add run exec',
    manager: managers,
    detection: 'auto default ' + managers,
    shell: 'bash zsh fish powershell',
    doctor: '--json --size --fix --pm --debug',
    doctorFix: '--json --size --fix --dry-run --pm --debug',
    '--info': '--json --size --pm --debug',
    '--why': '--json --pm --debug',
    config: '--show --pm --debug',
    configShow: '--show --json --pm --debug',
    initialize:
        '--default --pm --detection --symlink --no-symlink --sync-folder --storage-path --no-sync-folder --add-to-gitignore --no-add-to-gitignore --verbose --no-verbose',
    migrate: '--dry-run',
    restore: '--dry-run',
    native: '--pm --debug',
    path: '',
    none: '',
};

const shellClassifier = `
_fnspm_candidates() {
    local command="" expect="" word fix="" show="" other="" category="root"
    for word in "$@"; do
        [ "$word" = "--" ] && return
        if [ -n "$expect" ]; then [ "$word" = "=" ] && continue; expect=""; continue; fi
        case "$word" in
            --pm) expect="manager"; continue ;;
            --detection) expect="detection"; continue ;;
            --completion) expect="shell"; command="--completion"; continue ;;
            --sync-folder|--storage-path) expect="path"; continue ;;
            --pm=*|--detection=*|--sync-folder=*|--storage-path=*|--debug) continue ;;
            --info|--why) [ -z "$command" ] && command="$word"; continue ;;
            --fix) fix="yes" ;;
            --show) show="yes" ;;
            --*) continue ;;
            *) if [ -z "$command" ]; then command="$word"; else other="yes"; fi ;;
        esac
    done
    if [ -n "$expect" ]; then category="$expect"
    else
        case "$command" in
            '') category="root" ;;
            doctor) category="doctor"; [ -n "$fix" ] && category="doctorFix" ;;
            config) category="config"; [ -n "$show" ] && category="configShow"; [ -n "$other" ] && category="native" ;;
            initialize|init-config) category="initialize" ;;
            --info|--why|migrate|restore) category="$command" ;;
            --completion|help) category="none" ;;
            *) category="native" ;;
        esac
    fi
    case "$category" in
${Object.entries(candidates)
    .map(([key, words]) => `        ${key}) printf '%s\\n' '${words}' ;;`)
    .join('\n')}
    esac
}
`;

function bash(): string {
    return (
        shellClassifier +
        `
_fnspm_complete() {
    local cur="\${COMP_WORDS[COMP_CWORD]}" choices
    COMPREPLY=()
    [ "$cur" = "=" ] && cur=""
    choices="$(_fnspm_candidates "\${COMP_WORDS[@]:1:$((COMP_CWORD-1))}")"
    case "$cur" in
        --pm=*) case " $choices " in *" --pm "*) ;; *) return ;; esac; COMPREPLY=( $(compgen -W '${managers
            .split(' ')
            .map((m) => '--pm=' + m)
            .join(' ')}' -- "$cur") ); return ;;
        --detection=*) case " $choices " in *" --detection "*) ;; *) return ;; esac; COMPREPLY=( $(compgen -W '${(
            'auto default ' + managers
        )
            .split(' ')
            .map((m) => '--detection=' + m)
            .join(' ')}' -- "$cur") ); return ;;
    esac
    COMPREPLY=( $(compgen -W "$choices" -- "$cur") )
}
complete -o default -F _fnspm_complete fnspm
`
    );
}
function zsh(): string {
    return (
        '#compdef fnspm\n' +
        shellClassifier +
        `
_fnspm_complete() {
    local choices cur="$words[CURRENT]"
    choices="$(_fnspm_candidates "\${words[@]:1:$((CURRENT-2))}")"
    [ -n "$choices" ] || { _files; return; }
    case "$cur" in
        --pm=*) [[ " $choices " == *" --pm "* ]] || return; compadd -- ${managers
            .split(' ')
            .map((m) => '--pm=' + m)
            .join(' ')} ;;
        --detection=*) [[ " $choices " == *" --detection "* ]] || return; compadd -- ${(
            'auto default ' + managers
        )
            .split(' ')
            .map((m) => '--detection=' + m)
            .join(' ')} ;;
        *) compadd -- \${=choices} ;;
    esac
}
compdef _fnspm_complete fnspm
`
    );
}
function fish(): string {
    return `function _fnspm_complete
    set -l command_name ''
    set -l expect ''
    set -l fix ''
    set -l show_config ''
    set -l other ''
    set -l category root
    set -l words (commandline -opc)
    for word in $words[2..-1]
        if test "$word" = --; return; end
        if test -n "$expect"; set expect ''; continue; end
        switch $word
            case --pm
                set expect manager; continue
            case --detection
                set expect detection; continue
            case --completion
                set expect shell; set command_name --completion; continue
            case --sync-folder --storage-path
                set expect path; continue
            case '--pm=*' '--detection=*' '--sync-folder=*' '--storage-path=*' --debug
                continue
            case --info --why
                if test -z "$command_name"; set command_name $word; end
                continue
            case --fix
                set fix yes
            case --show
                set show_config yes
            case '--*'
                continue
            case '*'
                if test -z "$command_name"; set command_name $word; else; set other yes; end
        end
    end
    if test -n "$expect"
        set category $expect
    else
        switch $command_name
            case ''
                set category root
            case doctor
                set category doctor
                if test -n "$fix"; set category doctorFix; end
            case config
                set category config
                if test -n "$show_config"; set category configShow; end
                if test -n "$other"; set category native; end
            case initialize init-config
                set category initialize
            case --info --why migrate restore
                set category $command_name
            case --completion help
                set category none
            case '*'
                set category native
        end
    end
    set -l cur (commandline -ct)
    if string match -q -- '--pm=*' $cur
        if not contains -- $category root doctor doctorFix --info --why config configShow initialize native; return; end
        for manager in npm yarn pnpm bun deno
            printf '%s\\n' --pm=$manager
        end
        return
    end
    if string match -q -- '--detection=*' $cur
        if test "$category" != initialize; return; end
        for mode in auto default npm yarn pnpm bun deno
            printf '%s\\n' --detection=$mode
        end
        return
    end
    switch $category
${Object.entries(candidates)
    .map(
        ([key, words]) =>
            `        case ${key}\n            printf '%s\\n' ${
                words
                    ? words
                          .split(' ')
                          .map((word) => "'" + word + "'")
                          .join(' ')
                    : "''"
            }`,
    )
    .join('\n')}
    end
end
complete -c fnspm -a '(_fnspm_complete)'
`;
}
function powershell(): string {
    return `$FnspmCandidates = @{
${Object.entries(candidates)
    .map(([key, words]) => `    '${key}' = '${words}'`)
    .join('\n')}
}
$FnspmCompleter = {
    param($wordToComplete, $commandAst, $cursorPosition)
    $commandName = ''; $expect = ''; $fix = $false; $showConfig = $false; $other = $false; $category = 'root'
    $start = $cursorPosition - $wordToComplete.Length
    $words = @($commandAst.CommandElements | Select-Object -Skip 1 | Where-Object { $_.Extent.EndOffset -le $start })
    foreach ($element in $words) {
        $word = if ($element -is [System.Management.Automation.Language.StringConstantExpressionAst]) { $element.Value } else { $element.Extent.Text }
        if ($word -eq '--') { return }
        if ($expect) { $expect = ''; continue }
        if ($word -eq '--pm') { $expect = 'manager'; continue }
        if ($word -eq '--detection') { $expect = 'detection'; continue }
        if ($word -eq '--completion') { $expect = 'shell'; $commandName = '--completion'; continue }
        if ($word -in @('--sync-folder', '--storage-path')) { $expect = 'path'; continue }
        if ($word -match '^--(pm|detection|sync-folder|storage-path)=') { continue }
        if ($word -in @('--info', '--why')) { if (-not $commandName) { $commandName = $word }; continue }
        if ($word -eq '--fix') { $fix = $true; continue }
        if ($word -eq '--show') { $showConfig = $true; continue }
        if ($word.StartsWith('-')) { continue }
        if (-not $commandName) { $commandName = $word } else { $other = $true }
    }
    if ($expect) { $category = $expect }
    elseif ($commandName -eq 'doctor') { $category = if ($fix) { 'doctorFix' } else { 'doctor' } }
    elseif ($commandName -eq 'config') { $category = if ($other) { 'native' } elseif ($showConfig) { 'configShow' } else { 'config' } }
    elseif ($commandName -in @('initialize','init-config')) { $category = 'initialize' }
    elseif ($commandName -in @('--info','--why','migrate','restore')) { $category = $commandName }
    elseif ($commandName -in @('--completion','help')) { $category = 'none' }
    elseif ($commandName) { $category = 'native' }
    $choices = $FnspmCandidates[$category] -split ' '
    if ($wordToComplete.StartsWith('--pm=')) { if ($choices -notcontains '--pm') { return } };
    if ($choices -contains '--pm' -and $wordToComplete.StartsWith('--pm=')) { $choices = $FnspmCandidates.manager -split ' ' | ForEach-Object { '--pm=' + $_ } }
    if ($wordToComplete.StartsWith('--detection=')) { if ($choices -notcontains '--detection') { return } };
    if ($choices -contains '--detection' -and $wordToComplete.StartsWith('--detection=')) { $choices = $FnspmCandidates.detection -split ' ' | ForEach-Object { '--detection=' + $_ } }
    foreach ($choice in $choices) {
        if ($choice -and $choice.StartsWith($wordToComplete, [System.StringComparison]::OrdinalIgnoreCase)) {
            [System.Management.Automation.CompletionResult]::new($choice, $choice, 'ParameterValue', $choice)
        }
    }
}.GetNewClosure()
Register-ArgumentCompleter -Native -CommandName fnspm, fnspm.cmd -ScriptBlock $FnspmCompleter
`;
}

export function completionScript(shell: string): string {
    switch (shell) {
        case 'bash':
            return bash();
        case 'zsh':
            return zsh();
        case 'fish':
            return fish();
        case 'powershell':
            return powershell();
        default:
            throw new Error(
                'Use --completion with bash, zsh, fish, or powershell.',
            );
    }
}
