set -eux

cd "${0%/*}/../.."

# HACK: https://bugzilla.redhat.com/show_bug.cgi?id=2033020
dnf update -y pam || true

# allow test to set up things on the machine
mkdir -p /root/.ssh
curl https://raw.githubusercontent.com/cockpit-project/bots/main/machine/identity.pub >> /root/.ssh/authorized_keys
chmod 600 /root/.ssh/authorized_keys

# create user account for logging in
if ! id admin 2>/dev/null; then
    useradd -c Administrator -G wheel admin
    echo admin:foobar | chpasswd
fi

# set root's password
echo root:foobar | chpasswd

# avoid sudo lecture during tests
su -c 'echo foobar | sudo --stdin whoami' - admin

# disable core dumps, we rather investigate them upstream where test VMs are accessible
echo core > /proc/sys/kernel/core_pattern

sh test/vm.install

# Run tests in the cockpit tasks container, as unprivileged user
CONTAINER="$(cat .cockpit-ci/container)"
if grep -q platform:el10 /etc/os-release; then
    # HACK: https://bugzilla.redhat.com/show_bug.cgi?id=2273078
    export NETAVARK_FW=nftables
fi
exec podman \
    run \
        --rm \
        --shm-size=1024m \
        --security-opt=label=disable \
        --env='TEST_*' \
        --volume="${TMT_TEST_DATA}":/logs:rw,U --env=LOGS=/logs \
        --volume="$(pwd)":/source:rw,U --env=SOURCE=/source \
        --volume=/usr/lib/os-release:/run/host/usr/lib/os-release:ro \
        "${CONTAINER}" \
            sh /source/test/browser/run-test.sh
